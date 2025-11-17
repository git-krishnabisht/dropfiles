import type { Request, Response } from "express";
import logger from "../../shared/utils/logger.util.js";
import { s3, S3Uploader } from "../../shared/services/s3.service.js";
import { config } from "../../shared/config/env.config.js";
import { InitUploadResult } from "../../types/common.types.js";
import { rd } from "../../shared/utils/redis.util.js";
import { PrismaUtil } from "../../shared/utils/prisma.util.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import prisma from "../../shared/config/prisma.config.js";
import { ChunkStatus } from "@prisma/client";

const CHUNK_SIZE = 5 * 1024 * 1024;
const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024;
const REDIS_TTL = 24 * 60 * 60;

export class fileController {
  static async getUploadUrls(req: Request, res: Response) {
    try {
      const { file_id, file_name, file_type, file_size } = req.body;
      const user_id = req.jwtPayload?.userId;

      if (!file_id || !file_name || !file_type || !file_size || !user_id) {
        return res.status(400).json({ success: false, error: "Invalid input" });
      }

      const fileSizeBytes = Number(file_size);
      if (!fileSizeBytes || fileSizeBytes <= 0) {
        return res
          .status(400)
          .json({ success: false, error: "Invalid file size" });
      }

      if (fileSizeBytes > MAX_FILE_SIZE) {
        return res.status(400).json({
          success: false,
          error: "File exceeds allowed size limit",
        });
      }

      const s3_key = `dropbox/${user_id}/${Date.now()}-${file_name}`;
      const uploader = new S3Uploader(config.aws.bucket, s3_key);

      const init: InitUploadResult = await uploader.initUpload();
      if (!init.success || !init.uploadId) {
        logger.error("Init upload failed", { init });
        return res
          .status(500)
          .json({ success: false, error: "Upload init failed" });
      }

      const uploadId = init.uploadId;
      const numParts = Math.ceil(fileSizeBytes / CHUNK_SIZE);

      const urls = await Promise.all(
        Array.from({ length: numParts }, (_, i) =>
          uploader.generateUploadUrls(i + 1, uploadId).then((r) => {
            if (!r.success || !r.psurl) {
              throw new Error(`Failed presign part ${i + 1}`);
            }
            return r.psurl;
          })
        )
      );

      await rd.set(
        `upload:${uploadId}`,
        JSON.stringify({
          bucket: uploader.getBucket(),
          key: uploader.getKey(),
        }),
        "EX",
        REDIS_TTL
      );

      await prisma.$transaction(async (tx) => {
        await PrismaUtil.createFileMetadata(
          tx,
          file_id,
          file_name,
          file_type,
          file_size,
          s3_key,
          user_id
        );

        const chunks = Array.from({ length: numParts }, (_, i) => {
          const isLast = i === numParts - 1;
          return {
            fileId: file_id,
            chunkIndex: i,
            size: isLast ? fileSizeBytes - i * CHUNK_SIZE : CHUNK_SIZE,
            s3Key: s3_key,
            status: ChunkStatus.PENDING,
          };
        });

        await tx.chunk.createMany({ data: chunks });
      });

      return res.status(200).json({
        success: true,
        presignedUrls: urls,
        uploadId,
      });
    } catch (err) {
      logger.error("Error generating upload URLs", { err });
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  }

  static async recordChunkUpload(req: Request, res: Response) {
    try {
      const { file_id, chunk_index, etag } = req.body;

      if (!file_id || chunk_index === undefined || !etag) {
        return res.status(400).json({ success: false, error: "Invalid input" });
      }

      await PrismaUtil.updateChunk(file_id, chunk_index, etag);

      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error("Error while recording chunk", { err });
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  }

  static async completeUpload(req: Request, res: Response) {
    try {
      const { uploadId, parts, fileId } = req.body;

      if (!uploadId || !Array.isArray(parts) || !fileId) {
        return res.status(400).json({ success: false, error: "Invalid input" });
      }

      const cached = await rd.get(`upload:${uploadId}`);
      if (!cached) {
        return res
          .status(404)
          .json({ success: false, error: "Upload session missing" });
      }

      const { bucket, key } = JSON.parse(cached);
      const uploader = new S3Uploader(bucket, key);

      await uploader.completeUpload(parts, uploadId);
      await PrismaUtil.recordUploadedMetadata(fileId);
      await rd.del(`upload:${uploadId}`);

      return res.status(200).json({
        success: true,
        message: "Upload completed",
      });
    } catch (err) {
      logger.error("Error completing upload", { err });
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  }

  static async getDownloadUrl(req: Request, res: Response) {
    try {
      const { s3_key } = req.body;
      if (!s3_key) {
        return res.status(400).json({ success: false, error: "Missing key" });
      }

      const cmd = new GetObjectCommand({
        Bucket: config.aws.bucket,
        Key: s3_key,
      });

      const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 });
      if (!url) {
        return res
          .status(500)
          .json({ success: false, error: "Failed generating URL" });
      }

      return res.status(200).json({
        success: true,
        url,
      });
    } catch (err) {
      logger.error("Error generating download URL", { err });
      return res.status(500).json({ success: false, error: "Internal error" });
    }
  }

  static async abortUpload(req: Request, res: Response) {
    try {
      const { uploadId, file_id } = req.body;

      if (!uploadId || !file_id) {
        return res.status(400).json({
          success: false,
          error: "Missing Values in Request Body",
        });
      }

      logger.info("Aborting upload", { file_id, uploadId });

      const fileMetadata = await prisma.fileMetadata.findFirst({
        where: { fileId: file_id },
        select: { s3Key: true },
      });

      const s3_key = fileMetadata?.s3Key;

      if (!fileMetadata) {
        logger.info("Upload already aborted (no metadata found)", {
          file_id,
          uploadId,
        });
        return res.json({
          success: true,
          message: "Upload session already aborted",
        });
      }

      const redisDeleted = await rd.del(`upload:${uploadId}`);
      logger.info("Redis cleanup", {
        uploadId,
        deleted: redisDeleted,
        key: `upload:${uploadId}`,
      });

      try {
        await PrismaUtil.deleteFileMetadata(file_id);
        logger.info("Database records deleted", { file_id });
      } catch (dbErr: any) {
        if (dbErr.code === "P2025") {
          logger.info("Database records already deleted", { file_id });
        } else {
          throw dbErr;
        }
      }

      if (s3_key) {
        try {
          const uploader = new S3Uploader(config.aws.bucket, s3_key);
          await uploader.abortUpload(uploadId);
          logger.info("S3 multipart upload aborted", { s3_key, uploadId });
        } catch (s3Err: any) {
          if (s3Err.name === "NoSuchUpload") {
            logger.info("S3 upload already aborted or doesn't exist", {
              s3_key,
              uploadId,
            });
          } else {
            logger.error("Failed to abort S3 upload", {
              s3_key,
              uploadId,
              error: s3Err,
            });
          }
        }
      }

      logger.info("Upload session aborted successfully", {
        file_id,
        uploadId,
        s3_key,
      });

      return res.json({
        success: true,
        message: "Upload session aborted successfully",
      });
    } catch (err) {
      logger.error("Error aborting upload", { err });
      return res.status(500).json({
        success: false,
        error: "Internal error while aborting upload",
      });
    }
  }
}

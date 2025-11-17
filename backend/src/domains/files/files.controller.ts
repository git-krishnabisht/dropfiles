import type { Request, Response } from "express";
import logger from "../../shared/utils/logger.util.js";
import { s3, S3Uploader } from "../../shared/services/s3.service.js";
import { config } from "../../shared/config/env.config.js";
import { InitUploadResult } from "../../types/common.types.js";
import { rd } from "../../shared/utils/redis.util.js";
import { PrismaUtil } from "../../shared/utils/prisma.util.js";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const CHUNK_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_FILE_SIZE = 1 * 1024 * 1024 * 1024; // 1GB
const REDIS_TTL = 24 * 60 * 60; // 24 hours

interface GetUrlsRequestBody {
  file_id: string;
  file_name: string;
  file_type: string;
  file_size: string;
}

interface CompleteUploadRequestBody {
  uploadId: string;
  parts: Array<{ PartNumber: number; ETag: string }>;
  fileId: string;
}

interface RecordChunkRequestBody {
  upload_id: string;
  file_id: string;
  chunk_index: number;
  size: string;
  etag: string;
}

export class fileController {
  private static validateGetUrlsRequest(body: any): body is GetUrlsRequestBody {
    return (
      body.file_id &&
      body.file_name &&
      body.file_type &&
      body.file_size
    );
  }

  private static validateRecordChunkRequest(
    body: any
  ): body is RecordChunkRequestBody {
    return (
      body.file_id &&
      typeof body.chunk_index === "number" &&
      body.chunk_index >= 0 &&
      body.size &&
      body.etag
    );
  }

  private static validateCompleteUploadRequest(
    body: any
  ): body is CompleteUploadRequestBody {
    return (
      body.uploadId &&
      Array.isArray(body.parts) &&
      body.parts.length > 0 &&
      body.fileId
    );
  }

  static async getUploadUrls(req: Request, res: Response) {
    if (!fileController.validateGetUrlsRequest(req.body)) {
      logger.error("Missing or invalid fields in request", req.body);
      return res.status(400).json({
        success: false,
        error: "Missing or invalid required fields",
      });
    }

    const { file_id, file_name, file_type, file_size } = req.body;
    const user_id = req.jwtPayload?.userId;
    const s3_key = `dropbox/${user_id}/${file_name}`;

    const uploader = new S3Uploader(config.aws.bucket, s3_key);
    let uploadId: string | null = null;

    const fileSizeBytes = parseInt(file_size, 10);
    if (isNaN(fileSizeBytes) || fileSizeBytes <= 0) {
      return res.status(400).json({
        success: false,
        error: "Invalid file size",
      });
    }

    if (fileSizeBytes > MAX_FILE_SIZE) {
      return res.status(400).json({
        success: false,
        error: `File size exceeds maximum allowed size of ${
          MAX_FILE_SIZE / (1024 * 1024 * 1024)
        }GB`,
      });
    }

    logger.info("Fetched data from request body", req.body);

    logger.info("Initiating file upload");
    try {
      const init: InitUploadResult = await uploader.initUpload();

      if (!init.success || !init.uploadId) {
        logger.error("Failed to initialize upload", { init });
        throw new Error("Failed to initialize upload");
      }

      uploadId = init.uploadId;
      const numParts = Math.ceil(fileSizeBytes / CHUNK_SIZE);

      logger.info("Number of parts calculated", { numParts });

      const urls: string[] = [];
      logger.info("Generating presigned URLs...");

      for (let i = 1; i <= numParts; i++) {
        const { success, psurl } = await uploader.generateUploadUrls(
          i,
          uploadId
        );

        if (!success || !psurl) {
          logger.error("Failed to generate presigned URL", { partNumber: i });
          throw new Error(`Failed to generate presigned URL for part ${i}`);
        }

        urls.push(psurl);
      }

      if (urls.length !== numParts) {
        throw new Error(
          `URL count mismatch: expected ${numParts}, got ${urls.length}`
        );
      }

      // Store upload metadata in Redis with TTL
      await rd.set(
        uploadId,
        JSON.stringify({
          bucket: uploader.getBucket(),
          key: uploader.getKey(),
        }),
        "EX",
        REDIS_TTL
      );

      await PrismaUtil.createFileMetadata(
        file_id,
        file_name,
        file_type,
        file_size,
        s3_key,
        user_id!
      );

      for (let i = 0; i < numParts; i++) {
        const isLast = i === numParts - 1;
        const chunkSize = isLast ? fileSizeBytes - i * CHUNK_SIZE : CHUNK_SIZE;

        await PrismaUtil.createPendingChunk(file_id, i, chunkSize, s3_key);
      }

      logger.info("Generated S3 presigned URLs successfully", {
        fileId: file_id,
        uploadId,
        urlCount: urls.length,
      });

      return res.status(200).json({
        success: true,
        presignedUrls: urls,
        uploadId,
      });
    } catch (err) {
      logger.error("Error generating S3 presigned URLs", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        fileId: file_id,
      });
      return res.status(500).json({
        success: false,
        error: "Error generating S3 presigned URLs",
      });
    }
  }

  static async recordChunkUpload(req: Request, res: Response) {
    if (!fileController.validateRecordChunkRequest(req.body)) {
      logger.error("Missing or invalid fields in request", req.body);
      return res.status(400).json({
        success: false,
        error: "Missing or invalid required fields",
      });
    }

    const { file_id, chunk_index, etag } = req.body;

    try {
      await PrismaUtil.updateChunk(file_id, chunk_index, etag);

      logger.info("Chunk recorded successfully", {
        fileId: file_id,
        chunkIndex: chunk_index,
      });

      return res.status(200).json({ success: true });
    } catch (err) {
      logger.error("Error recording chunk upload", {
        error: err instanceof Error ? err.message : String(err),
        code: err instanceof Error && "code" in err ? err.code : undefined,
        fileId: file_id,
        chunkIndex: chunk_index,
      });

      return res.status(500).json({
        success: false,
        error: "Error recording chunk upload",
      });
    }
  }

  static async completeUpload(req: Request, res: Response) {
    if (!fileController.validateCompleteUploadRequest(req.body)) {
      logger.error("Missing or invalid fields in request", req.body);
      return res.status(400).json({
        success: false,
        errorType: "validation error",
        error: "Missing or invalid required fields",
      });
    }

    const { uploadId, parts, fileId } = req.body;

    try {
      const cachedData = await rd.get(uploadId);
      if (!cachedData) {
        logger.error("Upload metadata not found in cache", { uploadId });
        return res.status(404).json({
          success: false,
          error: "Upload session not found or expired",
        });
      }
      const { bucket, key } = JSON.parse(cachedData);
      const uploader = new S3Uploader(bucket, key);
      await uploader.completeUpload(parts, uploadId);

      await PrismaUtil.recordUploadedMetadata(fileId);
      await rd.del(uploadId);

      logger.info("File uploaded successfully", { fileId, uploadId });

      return res.status(200).json({
        success: true,
        message: "Successfully uploaded file to S3",
      });
    } catch (err) {
      logger.error("Error while completing upload", {
        error: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        uploadId,
        fileId,
      });

      return res.status(500).json({
        success: false,
        error: "Error while completing upload",
      });
    }
  }
  static async getDownloadUrl(req: Request, res: Response) {
    const { s3_key } = req.body;
    if (!s3_key) {
      logger.error("Data missing in the request body", req.body);
      return res.status(400).json({
        success: false,
        error: "Data missing in the request body",
      });
    }
    try {
      const command = new GetObjectCommand({
        Bucket: config.aws.bucket,
        Key: s3_key,
      });

      const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

      if (!url) {
        logger.error("Unable to fetch download URL");
        throw new Error("Unable to fetch download URL");
      }

      return res.status(200).json({
        success: true,
        url: url,
      });
    } catch (err) {
      logger.error("Error fetching download URL", {
        error: err instanceof Error ? err.message : String(err),
        code: err instanceof Error && "code" in err ? err.code : undefined,
        s3_key: s3_key,
      });

      return res.status(500).json({
        success: false,
        error: "Error fetching download URL",
      });
    }
  }
}

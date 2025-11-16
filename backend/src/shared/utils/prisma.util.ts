import prisma from "../config/prisma.config";
import logger from "./logger.util";
import { FileStatus, ChunkStatus } from "@prisma/client";

export class PrismaUtil {
  // USER
  static async userExists(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return !!user;
  }

  static async getUserId(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    return user?.id;
  }

  static async getPasswordHash(email: string) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { passwordHash: true },
    });

    if (!user?.passwordHash) {
      throw new Error("Password hash missing in DB");
    }

    return user.passwordHash;
  }

  static async createUser(email: string, name: string, passwordHash: string) {
    return prisma.user.create({
      data: {
        email,
        name,
        passwordHash,
      },
      select: { id: true },
    });
  }

  // SESSION (REFRESH TOKEN STORAGE)
  static async sessionExists(deviceId: string) {
    const session = await prisma.session.findFirst({
      where: { deviceId },
    });
    return !!session;
  }

  static async getSessionByDevice(deviceId: string) {
    return prisma.session.findUnique({
      where: { deviceId },
      include: { user: true },
    });
  }

  static async deleteSession(deviceId: string) {
    await prisma.session.deleteMany({
      where: { deviceId },
    });
  }

  static async createSession(
    userId: string,
    refreshTokenHash: string,
    deviceId: string,
    expiresAt: Date
  ) {
    return prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        deviceId,
        expiresAt,
      },
    });
  }

  static async updateSession(
    sessionId: string,
    newHash: string,
    newExpiry: Date
  ) {
    return prisma.session.update({
      where: { id: sessionId },
      data: {
        refreshTokenHash: newHash,
        expiresAt: newExpiry,
      },
    });
  }

  // FILE METADATA
  static async createFileMetadata(
    fileId: string,
    fileName: string,
    mimeType: string,
    fileSize: string,
    s3Key: string,
    userId: string
  ) {
    await prisma.fileMetadata.create({
      data: {
        fileId,
        fileName,
        mimeType,
        size: parseInt(fileSize, 10),
        s3Key,
        status: FileStatus.UPLOADING,
        userId,
      },
    });

    logger.info(`Created metadata for file_id: ${fileId}`);
  }

  static async recordUploadedMetadata(fileId: string) {
    await prisma.fileMetadata.update({
      where: { fileId },
      data: { status: FileStatus.UPLOADED },
    });

    logger.info(`Marked file_id ${fileId} as UPLOADED`);
  }

  static async recordFailedMetadata(fileId: string) {
    await prisma.fileMetadata.update({
      where: { fileId },
      data: { status: FileStatus.FAILED },
    });

    logger.info(`Marked file_id ${fileId} as FAILED`);
  }

  static async deleteFileMetadata(fileId: string) {
    await prisma.fileMetadata.delete({
      where: { fileId },
    });

    logger.info(`Deleted metadata for file_id: ${fileId}`);
  }

  // CHUNKS
  static async createPendingChunk(
    fileId: string,
    chunkIndex: number,
    size: number,
    s3Key: string,
    etag?: string
  ) {
    await prisma.chunk.create({
      data: {
        fileId,
        chunkIndex,
        size,
        s3Key,
        checksum: etag,
        status: ChunkStatus.PENDING,
      },
    });

    logger.info(`Created chunk index ${chunkIndex}`);
  }

  static async updateChunk(fileId: string, chunkIndex: number, etag: string) {
    await prisma.chunk.update({
      where: {
        fileId_chunkIndex: {
          fileId,
          chunkIndex,
        },
      },
      data: {
        checksum: etag,
        status: ChunkStatus.COMPLETED,
      },
    });

    logger.info(`Updated chunk index ${chunkIndex} as COMPLETED`);
  }

  static async recordFailedChunk(fileId: string, chunkIndex: number) {
    await prisma.chunk.update({
      where: {
        fileId_chunkIndex: {
          fileId,
          chunkIndex,
        },
      },
      data: { status: ChunkStatus.FAILED },
    });

    logger.info(`Marked chunk index ${chunkIndex} as FAILED`);
  }

  static async recordFailedChunkMany(fileId: string) {
    await prisma.chunk.updateMany({
      where: { fileId },
      data: { status: ChunkStatus.FAILED },
    });

    logger.info(`Marked all chunks as FAILED for file_id: ${fileId}`);
  }

  static async deleteChunks(fileId: string) {
    await prisma.chunk.deleteMany({
      where: { fileId },
    });

    logger.info(`Deleted chunks for file_id: ${fileId}`);
  }
}

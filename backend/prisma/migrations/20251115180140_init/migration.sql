-- CreateEnum
CREATE TYPE "public"."FileStatus" AS ENUM ('UPLOADING', 'UPLOADED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."ChunkStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE
  "public"."user" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "password_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE
  "public"."sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "rt_hash" TEXT NOT NULL,
    "device_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
  );

-- CreateTable
CREATE TABLE
  "public"."metadata" (
    "file_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER,
    "s3_key" TEXT NOT NULL,
    "status" "public"."FileStatus" NOT NULL DEFAULT 'UPLOADING',
    "user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "metadata_pkey" PRIMARY KEY ("file_id")
  );

-- CreateTable
CREATE TABLE
  "public"."chunks" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "size" INTEGER NOT NULL,
    "s3_key" TEXT NOT NULL,
    "checksum" TEXT,
    "status" "public"."ChunkStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
  );

-- CreateIndex
CREATE UNIQUE INDEX "user_email_key" ON "public"."user" ("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_device_id_key" ON "public"."sessions" ("device_id");

-- CreateIndex
CREATE INDEX "metadata_user_id_idx" ON "public"."metadata" ("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "chunks_index_key" ON "public"."chunks" ("index");

-- CreateIndex
CREATE INDEX "chunks_file_id_idx" ON "public"."chunks" ("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "chunks_file_id_index_key" ON "public"."chunks" ("file_id", "index");

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."metadata" ADD CONSTRAINT "metadata_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."user" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."chunks" ADD CONSTRAINT "chunks_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "public"."metadata" ("file_id") ON DELETE CASCADE ON UPDATE CASCADE;
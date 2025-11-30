import type { UploadProgress, UploadPart } from "../types/common.type";

const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

export class FileUploader {
  private file: File;
  private chunkSize: number;
  private numParts: number;
  private fileId: string;
  private apiBaseUrl: string;
  private onProgress?: (progress: UploadProgress) => void;
  private abortController: AbortController;
  private maxParallelUploads: number;
  private uploadId?: string;
  private abortCalled: boolean = false;

  constructor(
    file: File,
    chunkSize: number = 5 * 1024 * 1024,
    apiBaseUrl: string = "http://localhost:50136/api",
    onProgress?: (progress: UploadProgress) => void,
    maxParallelUploads: number = 3
  ) {
    this.file = file;
    this.chunkSize = chunkSize;
    this.numParts = Math.ceil(file.size / chunkSize);
    this.fileId = generateUUID();
    this.apiBaseUrl = apiBaseUrl;
    this.onProgress = onProgress;
    this.abortController = new AbortController();
    this.maxParallelUploads = maxParallelUploads;
  }

  getPart(partNumber: number): Blob {
    const start = (partNumber - 1) * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.file.size);
    return this.file.slice(start, end);
  }

  cancel(): void {
    console.log("Cancelling upload...");
    this.abortController.abort();
  }

  async cancelWithCleanup(): Promise<void> {
    console.log("Cancelling upload with cleanup...", {
      uploadId: this.uploadId,
    });
    this.abortController.abort();

    if (this.uploadId && !this.abortCalled) {
      await this.abortUpload(this.uploadId);
    }
  }

  private updateProgress(uploadedChunks: number): void {
    if (this.onProgress) {
      this.onProgress({
        uploadedChunks,
        totalChunks: this.numParts,
        percentage: Math.round((uploadedChunks / this.numParts) * 100),
      });
    }
  }

  private async makeRequest(
    endpoint: string,
    body: any,
    retries: number = 3
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      if (this.abortController.signal.aborted) {
        throw new Error("Upload cancelled by user");
      }

      try {
        const response = await fetch(`${this.apiBaseUrl}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: this.abortController.signal,
          credentials: "include",
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(
            errorData.error || `HTTP ${response.status}: ${response.statusText}`
          );
        }

        return response;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          throw new Error("Upload cancelled by user");
        }

        lastError = err instanceof Error ? err : new Error(String(err));

        if (attempt < retries - 1) {
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(
            `Request failed (attempt ${attempt + 1
            }/${retries}), retrying in ${delay}ms...`,
            lastError.message
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  private async abortUpload(uploadId: string): Promise<void> {
    if (this.abortCalled) {
      console.log("Abort already called, skipping...");
      return;
    }

    this.abortCalled = true;

    try {
      console.log("Calling abort endpoint", { uploadId, fileId: this.fileId });

      const abortRequestController = new AbortController();
      const timeout = setTimeout(() => abortRequestController.abort(), 10000);

      const response = await fetch(`${this.apiBaseUrl}/files/abort-upload`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uploadId,
          file_id: this.fileId,
        }),
        signal: abortRequestController.signal,
        credentials: "include",
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || "Failed to abort upload");
      }

      const result = await response.json();
      console.log("Upload aborted successfully", result);
    } catch (err) {
      console.error("Failed to abort upload on server:", err);
    }
  }

  async upload(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("Initiating upload...", {
        fileName: this.file.name,
        fileSize: this.file.size,
        chunks: this.numParts,
      });

      const initResponse = await this.makeRequest("/files/get-upload-urls", {
        file_id: this.fileId,
        file_name: this.file.name,
        file_type: this.file.type,
        file_size: this.file.size.toString(),
      });

      const response = await initResponse.json();
      this.uploadId = response.uploadId;
      const { presignedUrls } = response;

      if (!presignedUrls || !this.uploadId) {
        throw new Error("Invalid response from server");
      }

      console.log("Upload initialized", {
        uploadId: this.uploadId,
        urlCount: presignedUrls.length,
      });

      const uploadedParts: UploadPart[] = [];
      let completedChunks = 0;

      const uploadChunk = async (partNumber: number) => {
        if (this.abortController.signal.aborted) {
          throw new Error("Upload cancelled by user");
        }

        const chunk = this.getPart(partNumber);

        console.log(`Uploading chunk ${partNumber}/${this.numParts}...`);

        const s3Response = await fetch(presignedUrls[partNumber - 1], {
          method: "PUT",
          body: chunk,
          headers: { "Content-Type": "application/octet-stream" },
          signal: this.abortController.signal,
        });

        if (!s3Response.ok) {
          throw new Error(
            `Failed to upload chunk ${partNumber}: ${s3Response.statusText}`
          );
        }

        const etag = s3Response.headers.get("etag");

        if (!etag) {
          throw new Error(`No ETag received for chunk ${partNumber}`);
        }

        const record_chunk = await this.makeRequest("/files/record-chunk", {
          file_id: this.fileId,
          chunk_index: partNumber - 1,
          size: chunk.size.toString(),
          etag: etag.replace(/"/g, ""),
        }).then((x) => x.json());

        if (!record_chunk.success) {
          throw new Error(`Failed to record chunk ${partNumber}`);
        }

        completedChunks++;
        this.updateProgress(completedChunks);

        return {
          ETag: etag,
          PartNumber: partNumber,
        };
      };

      for (let i = 1; i <= this.numParts; i += this.maxParallelUploads) {
        if (this.abortController.signal.aborted) {
          throw new Error("Upload cancelled by user");
        }

        const batch = [];
        for (
          let j = i;
          j < Math.min(i + this.maxParallelUploads, this.numParts + 1);
          j++
        ) {
          batch.push(uploadChunk(j));
        }
        const batchResults = await Promise.all(batch);
        uploadedParts.push(...batchResults);
      }

      console.log("All chunks uploaded, completing upload...");

      const completeResponse = await this.makeRequest(
        "/files/complete-upload",
        {
          uploadId: this.uploadId,
          parts: uploadedParts,
          fileId: this.fileId,
        }
      );

      const completeResult = await completeResponse.json();

      if (!completeResult.success) {
        throw new Error(completeResult.error || "Failed to complete upload");
      }

      console.log("Upload completed successfully!");
      return { success: true };
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      console.error("Upload failed:", errorMessage);

      // Only call abort if:
      // 1. We have an uploadId
      // 2. It's not a user cancellation (that's handled by cancelWithCleanup)
      // 3. We haven't already called abort
      if (
        this.uploadId &&
        errorMessage !== "Upload cancelled by user" &&
        !this.abortCalled
      ) {
        await this.abortUpload(this.uploadId);
      }

      return { success: false, error: errorMessage };
    }
  }
}


import { v4 as uuidv4 } from "uuid";

interface UploadProgress {
  uploadedChunks: number;
  totalChunks: number;
  percentage: number;
}

interface UploadPart {
  ETag: string;
  PartNumber: number;
}

class FileUploader {
  private file: File;
  private chunkSize: number;
  private numParts: number;
  private fileId: string;
  private apiBaseUrl: string;
  private onProgress?: (progress: UploadProgress) => void;
  private abortController: AbortController;

  constructor(
    file: File,
    chunkSize: number = 5 * 1024 * 1024,
    apiBaseUrl: string = "http://localhost:50136/api",
    onProgress?: (progress: UploadProgress) => void
  ) {
    this.file = file;
    this.chunkSize = chunkSize;
    this.numParts = Math.ceil(file.size / chunkSize);
    this.fileId = uuidv4();
    this.apiBaseUrl = apiBaseUrl;
    this.onProgress = onProgress;
    this.abortController = new AbortController();
  }

  // File partitioning
  getPart(partNumber: number): Blob {
    const start = (partNumber - 1) * this.chunkSize;
    const end = Math.min(start + this.chunkSize, this.file.size);
    return this.file.slice(start, end);
  }

  // Cancel the upload
  cancel(): void {
    this.abortController.abort();
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
          // Exponential backoff: wait 1s, 2s, 4s
          const delay = Math.pow(2, attempt) * 1000;
          console.warn(
            `Request failed (attempt ${
              attempt + 1
            }/${retries}), retrying in ${delay}ms...`,
            lastError.message
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error("Request failed after retries");
  }

  async upload(): Promise<{ success: boolean; error?: string }> {
    try {
      console.log("Initiating upload...", {
        fileName: this.file.name,
        fileSize: this.file.size,
        chunks: this.numParts,
      });

      // Step 1: Initialize upload and get presigned URLs
      const initResponse = await this.makeRequest("/files/get-upload-urls", {
        file_id: this.fileId,
        file_name: this.file.name,
        file_type: this.file.type,
        file_size: this.file.size.toString(),
      });

      const { presignedUrls, uploadId } = await initResponse.json();

      if (!presignedUrls || !uploadId) {
        throw new Error("Invalid response from server");
      }

      console.log("Upload initialized", {
        uploadId,
        urlCount: presignedUrls.length,
      });

      const uploadedParts: UploadPart[] = [];

      // Step 2: Upload chunks to S3
      for (let i = 1; i <= this.numParts; i++) {
        const chunk = this.getPart(i);

        console.log(`Uploading chunk ${i}/${this.numParts}...`);

        // Upload chunk to S3
        const s3Response = await fetch(presignedUrls[i - 1], {
          method: "PUT",
          body: chunk,
          headers: { "Content-Type": "application/octet-stream" },
          signal: this.abortController.signal,
        });

        if (!s3Response.ok) {
          throw new Error(
            `Failed to upload chunk ${i}: ${s3Response.statusText}`
          );
        }

        const etag = s3Response.headers.get("etag");

        if (!etag) {
          throw new Error(`No ETag received for chunk ${i}`);
        }

        // Record chunk in database
        await this.makeRequest("/files/record-chunk", {
          file_id: this.fileId,
          chunk_index: i - 1, // 0-indexed in database
          size: chunk.size.toString(),
          etag: etag.replace(/"/g, ""), // Remove quotes from ETag
        });

        uploadedParts.push({
          ETag: etag,
          PartNumber: i,
        });

        this.updateProgress(i);
      }

      console.log("All chunks uploaded, completing upload...");

      // Step 3: Complete the multipart upload
      const completeResponse = await this.makeRequest(
        "/files/complete-upload",
        {
          uploadId,
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
      return { success: false, error: errorMessage };
    }
  }
}

// UI Logic
class UploadUI {
  private fileInput: HTMLInputElement;
  private uploadBtn: HTMLButtonElement;
  private progressBar?: HTMLProgressElement;
  private statusText?: HTMLElement;
  private cancelBtn?: HTMLButtonElement;
  private currentUploader?: FileUploader;

  constructor() {
    this.fileInput = document.querySelector<HTMLInputElement>("#fileInput")!;
    this.uploadBtn = document.querySelector<HTMLButtonElement>("#uploadBtn")!;
    this.progressBar =
      document.querySelector<HTMLProgressElement>("#progressBar") || undefined;
    this.statusText =
      document.querySelector<HTMLElement>("#statusText") || undefined;
    this.cancelBtn =
      document.querySelector<HTMLButtonElement>("#cancelBtn") || undefined;

    this.setupEventListeners();
  }

  private setupEventListeners(): void {
    this.uploadBtn.addEventListener("click", () => this.handleUpload());

    if (this.cancelBtn) {
      this.cancelBtn.addEventListener("click", () => this.handleCancel());
    }

    this.fileInput.addEventListener("change", () => {
      if (this.fileInput.files && this.fileInput.files.length > 0) {
        this.updateStatus(`Selected: ${this.fileInput.files[0].name}`);
      }
    });
  }

  private handleCancel(): void {
    if (this.currentUploader) {
      this.currentUploader.cancel();
      this.updateStatus("Upload cancelled");
      this.setButtonsState(false);
    }
  }

  private async handleUpload(): Promise<void> {
    try {
      if (!this.fileInput.files || this.fileInput.files.length === 0) {
        alert("Please select a file");
        return;
      }

      const file = this.fileInput.files[0];
      this.setButtonsState(true);
      this.updateStatus("Starting upload...");

      this.currentUploader = new FileUploader(
        file,
        5 * 1024 * 1024,
        "http://localhost:50136/api",
        (progress) => this.updateProgress(progress)
      );

      const result = await this.currentUploader.upload();

      if (result.success) {
        this.updateStatus("✓ Upload completed successfully!");
        this.fileInput.value = "";
        if (this.progressBar) this.progressBar.value = 100;
      } else {
        this.updateStatus(
          `✗ Upload failed: ${result.error || "Unknown error"}`
        );
      }
    } catch (err) {
      console.error("Upload error:", err);
      this.updateStatus(
        `✗ Upload failed: ${
          err instanceof Error ? err.message : "Unknown error"
        }`
      );
    } finally {
      if (this.progressBar) this.progressBar.value = 0;
      this.setButtonsState(false);
      this.currentUploader = undefined;
    }
  }

  private updateProgress(progress: UploadProgress): void {
    if (this.progressBar) {
      this.progressBar.value = progress.percentage;
      this.progressBar.max = 100;
    }
    this.updateStatus(
      `Uploading: ${progress.uploadedChunks}/${progress.totalChunks} chunks (${progress.percentage}%)`
    );
  }

  private updateStatus(message: string): void {
    if (this.statusText) {
      this.statusText.textContent = message;
    }
    console.log(message);
  }

  private setButtonsState(uploading: boolean): void {
    this.uploadBtn.disabled = uploading;
    this.fileInput.disabled = uploading;

    if (this.cancelBtn) {
      this.cancelBtn.disabled = !uploading;
      this.cancelBtn.style.display = uploading ? "inline-block" : "none";
    }
  }
}

// Initialize the UI
document.addEventListener("DOMContentLoaded", () => {
  new UploadUI();
});

import React, { useState, useRef } from "react";
import { Upload, X, CheckCircle, AlertCircle, File } from "lucide-react";

// Generate a simple UUID
const generateUUID = () => {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
};

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

  private maxParallelUploads: number;

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
    this.abortController.abort();
  }

  async cancelWithCleanup(uploadId?: string): Promise<void> {
    this.abortController.abort();
    if (uploadId) {
      await this.abortUpload(uploadId);
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

  private async abortUpload(uploadId?: string): Promise<void> {
    try {
      if (uploadId) {
        await this.makeRequest("/files/abort-upload", {
          uploadId,
          fileId: this.fileId,
        });
        console.log("Upload aborted successfully");
      }
    } catch (err) {
      console.error("Failed to abort upload:", err);
    }
  }

  async upload(): Promise<{ success: boolean; error?: string }> {
    let uploadId: string | undefined;

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
      uploadId = response.uploadId;
      const { presignedUrls } = response;

      if (!presignedUrls || !uploadId) {
        throw new Error("Invalid response from server");
      }

      console.log("Upload initialized", {
        uploadId,
        urlCount: presignedUrls.length,
      });

      const uploadedParts: UploadPart[] = [];
      let completedChunks = 0;

      // Upload chunks in parallel batches
      const uploadChunk = async (partNumber: number) => {
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
          await this.abortUpload(uploadId);
        }

        completedChunks++;
        this.updateProgress(completedChunks);

        return {
          ETag: etag,
          PartNumber: partNumber,
        };
      };

      // Process chunks in parallel batches
      for (let i = 1; i <= this.numParts; i += this.maxParallelUploads) {
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

      // Abort the upload on the server if it was initiated
      if (uploadId) {
        await this.abortUpload(uploadId);
      }

      return { success: false, error: errorMessage };
    }
  }
}

export default function FileUploaderApp() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<UploadProgress>({
    uploadedChunks: 0,
    totalChunks: 0,
    percentage: 0,
  });
  const [status, setStatus] = useState<string>("");
  const [uploadStatus, setUploadStatus] = useState<
    "idle" | "success" | "error"
  >("idle");

  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploaderRef = useRef<FileUploader | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setStatus(`Selected: ${file.name}`);
      setUploadStatus("idle");
      setProgress({ uploadedChunks: 0, totalChunks: 0, percentage: 0 });
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setStatus("Please select a file");
      return;
    }

    setUploading(true);
    setUploadStatus("idle");
    setStatus("Starting upload...");

    uploaderRef.current = new FileUploader(
      selectedFile,
      5 * 1024 * 1024,
      "http://localhost:50136/api",
      (prog) => {
        setProgress(prog);
        setStatus(
          `Uploading: ${prog.uploadedChunks}/${prog.totalChunks} chunks (${prog.percentage}%)`
        );
      },
      3 // Upload 3 chunks in parallel
    );

    try {
      const result = await uploaderRef.current.upload();

      if (result.success) {
        setStatus("Upload completed successfully!");
        setUploadStatus("success");
        setProgress({ uploadedChunks: 0, totalChunks: 0, percentage: 100 });
        setSelectedFile(null);
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      } else {
        setStatus(`Upload failed: ${result.error || "Unknown error"}`);
        setUploadStatus("error");
      }
    } catch (err) {
      setStatus(
        `Upload failed: ${err instanceof Error ? err.message : "Unknown error"}`
      );
      setUploadStatus("error");
    } finally {
      setUploading(false);
      uploaderRef.current = null;
    }
  };

  const handleCancel = () => {
    if (uploaderRef.current) {
      uploaderRef.current.cancel();
      setStatus("Upload cancelled");
      setUploadStatus("error");
      setUploading(false);
      uploaderRef.current = null;
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
  };

  return (
    <div className="min-h-screen bg-linear-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-2xl">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-indigo-100 rounded-full mb-4">
            <Upload className="w-8 h-8 text-indigo-600" />
          </div>
          <h1 className="text-3xl font-bold text-gray-800 mb-2">
            File Uploader
          </h1>
          <p className="text-gray-600">
            Upload large files with chunked multipart upload
          </p>
        </div>

        <div className="space-y-6">
          {/* File Selection */}
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              disabled={uploading}
              className="hidden"
              id="fileInput"
            />
            <label
              htmlFor="fileInput"
              className={`cursor-pointer block ${
                uploading ? "opacity-50 cursor-not-allowed" : ""
              }`}
            >
              <File className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-700 font-medium mb-1">
                {selectedFile ? selectedFile.name : "Choose a file to upload"}
              </p>
              {selectedFile && (
                <p className="text-sm text-gray-500">
                  {formatFileSize(selectedFile.size)}
                </p>
              )}
              {!selectedFile && (
                <p className="text-sm text-gray-500">Click to browse</p>
              )}
            </label>
          </div>

          {/* Progress Bar */}
          {uploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm text-gray-600">
                <span>Progress</span>
                <span>{progress.percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${progress.percentage}%` }}
                />
              </div>
            </div>
          )}

          {/* Status Message */}
          {status && (
            <div
              className={`flex items-center gap-2 p-4 rounded-lg ${
                uploadStatus === "success"
                  ? "bg-green-50 text-green-800"
                  : uploadStatus === "error"
                  ? "bg-red-50 text-red-800"
                  : "bg-blue-50 text-blue-800"
              }`}
            >
              {uploadStatus === "success" && (
                <CheckCircle className="w-5 h-5" />
              )}
              {uploadStatus === "error" && <AlertCircle className="w-5 h-5" />}
              <p className="text-sm font-medium">{status}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleUpload}
              disabled={!selectedFile || uploading}
              className="flex-1 bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              <Upload className="w-5 h-5" />
              {uploading ? "Uploading..." : "Upload File"}
            </button>

            {uploading && (
              <button
                onClick={handleCancel}
                className="px-6 py-3 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-colors flex items-center justify-center gap-2"
              >
                <X className="w-5 h-5" />
                Cancel
              </button>
            )}
          </div>
        </div>

        {/* Info */}
        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Files are uploaded in 5MB chunks with 3 parallel uploads to S3
          </p>
        </div>
      </div>
    </div>
  );
}

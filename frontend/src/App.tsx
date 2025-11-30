import React, { useState, useRef } from "react";
import { Upload, X, CheckCircle, AlertCircle, File } from "lucide-react";
import type { UploadProgress } from "./types/common.type";
import { FileUploader } from "./utils/file-upload.util";

export default function App() {
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

  const handleCancel = async () => {
    if (uploaderRef.current) {
      setStatus("Cancelling upload...");

      await uploaderRef.current.cancelWithCleanup();

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

        <div className="mt-8 pt-6 border-t border-gray-200">
          <p className="text-xs text-gray-500 text-center">
            Files are uploaded in 5MB chunks with 3 parallel uploads to S3
          </p>
        </div>
      </div>
    </div>
  );
}

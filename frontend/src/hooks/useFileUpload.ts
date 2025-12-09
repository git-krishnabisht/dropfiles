import { useState, useRef } from "react";
import { FileUploader } from "../utils/file-upload.util";
import type { UploadProgress } from "../types/common.type";

const baseURL = import.meta.env.VITE_BASE_URL;

interface UseFileUploadResult {
  selectedFile: File | null;
  uploading: boolean;
  uploadProgress: UploadProgress;
  selectFile: (file: File) => void;
  clearFile: () => void;
  startUpload: () => Promise<{ success: boolean; error?: string }>;
  cancelUpload: () => Promise<void>;
}

export function useFileUpload(): UseFileUploadResult {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress>({
    uploadedChunks: 0,
    totalChunks: 0,
    percentage: 0,
  });

  const uploaderRef = useRef<FileUploader | null>(null);

  const selectFile = (file: File) => {
    setSelectedFile(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    setUploadProgress({ uploadedChunks: 0, totalChunks: 0, percentage: 0 });
  };

  const startUpload = async (): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!selectedFile) {
      return { success: false, error: "No file selected" };
    }

    setUploading(true);

    uploaderRef.current = new FileUploader(
      selectedFile,
      5 * 1024 * 1024,
      baseURL,
      (prog) => setUploadProgress(prog),
      3
    );

    try {
      const result = await uploaderRef.current.upload();
      return result;
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    } finally {
      setUploading(false);
      uploaderRef.current = null;
    }
  };

  const cancelUpload = async () => {
    if (uploaderRef.current) {
      await uploaderRef.current.cancelWithCleanup();
      setUploading(false);
      uploaderRef.current = null;
    }
  };

  return {
    selectedFile,
    uploading,
    uploadProgress,
    selectFile,
    clearFile,
    startUpload,
    cancelUpload,
  };
}

import React, { useRef } from "react";
import { X, File } from "lucide-react";
import { formatFileSize } from "../helpers/file.helper";
import type { UploadProgress } from "../types/common.type";

interface UploadModalProps {
  isOpen: boolean;
  selectedFile: File | null;
  uploading: boolean;
  uploadProgress: UploadProgress;
  onClose: () => void;
  onFileSelect: (file: File) => void;
  onUpload: () => void;
  onCancel: () => void;
}

export default function UploadModal({
  isOpen,
  selectedFile,
  uploading,
  uploadProgress,
  onClose,
  onFileSelect,
  onUpload,
  onCancel,
}: UploadModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-lg">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold text-gray-800">Upload File</h2>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <div className="space-y-6">
          <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center hover:border-indigo-400 transition-colors">
            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileChange}
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
                <span>{uploadProgress.percentage}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
                <div
                  className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                  style={{ width: `${uploadProgress.percentage}%` }}
                />
              </div>
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={onUpload}
              disabled={!selectedFile || uploading}
              className="flex-1 bg-indigo-600 text-white py-3 px-6 rounded-lg font-medium hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              {uploading ? "Uploading..." : "Upload"}
            </button>

            {uploading && (
              <button
                onClick={onCancel}
                className="px-6 py-3 bg-red-100 text-red-700 rounded-lg font-medium hover:bg-red-200 transition-colors"
              >
                Cancel
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

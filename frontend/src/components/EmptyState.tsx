import { File, Upload } from "lucide-react";

interface EmptyStateProps {
  hasSearch: boolean;
  onUploadClick?: () => void;
}

export default function EmptyState({
  hasSearch,
  onUploadClick,
}: EmptyStateProps) {
  return (
    <div className="text-center py-16">
      <File className="w-16 h-16 text-gray-300 mx-auto mb-4" />
      <h3 className="text-lg font-medium text-gray-900 mb-2">
        {hasSearch ? "No files found" : "No files yet"}
      </h3>
      <p className="text-gray-500 mb-4">
        {hasSearch
          ? "Try adjusting your search"
          : "Upload your first file to get started"}
      </p>
      {!hasSearch && onUploadClick && (
        <button
          onClick={onUploadClick}
          className="inline-flex items-center gap-2 bg-indigo-600 text-white px-6 py-3 rounded-lg hover:bg-indigo-700 transition-colors"
        >
          <Upload className="w-4 h-4" />
          Upload File
        </button>
      )}
    </div>
  );
}

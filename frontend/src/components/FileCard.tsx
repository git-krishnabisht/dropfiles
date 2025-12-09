import { Download, Trash2 } from "lucide-react";
import {
  formatFileSize,
  formatDate,
  getFileIcon,
} from "../helpers/file.helper";

interface FileMetadata {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  s3Key: string;
  status: string;
  createdAt: string;
}

interface FileCardProps {
  file: FileMetadata;
  onDownload: (file: FileMetadata) => void;
  onDelete: (fileId: string, fileName: string) => void;
}

export default function FileCard({
  file,
  onDownload,
  onDelete,
}: FileCardProps) {
  const getStatusColor = (status: string) => {
    if (status === "UPLOADED") return "text-green-600";
    if (status === "UPLOADING") return "text-blue-600";
    return "text-red-600";
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-4">
        <div className="text-4xl">{getFileIcon(file.mimeType)}</div>
        <div className="flex gap-2">
          <button
            onClick={() => onDownload(file)}
            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => onDelete(file.fileId, file.fileName)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            title="Delete"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <h3
        className="font-semibold text-gray-900 mb-2 truncate"
        title={file.fileName}
      >
        {file.fileName}
      </h3>

      <div className="space-y-1 text-sm text-gray-600">
        <p>Size: {formatFileSize(file.size)}</p>
        <p>Uploaded: {formatDate(file.createdAt)}</p>
        <p className="capitalize">
          Status:{" "}
          <span className={`font-medium ${getStatusColor(file.status)}`}>
            {file.status.toLowerCase()}
          </span>
        </p>
      </div>
    </div>
  );
}

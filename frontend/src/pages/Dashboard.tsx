import { useNavigate } from "react-router-dom";
import Navbar from "../components/NavBar";
import SearchBar from "../components/SearchBar";
import FileCard from "../components/FileCard";
import EmptyState from "../components/EmptyState";
import LoadingSpinner from "../components/LoadingSpinner";
import StatusMessage from "../components/StatusMessage";
import UploadModal from "../components/UploadModal";
import { FileAPIService } from "../services/file-api.service";
import { useFileUpload } from "../hooks/useFileUpload";
import { useStatusMessage } from "../hooks/useStatusMessage";
import { useEffect, useState } from "react";
import { useAuth } from "../contexts/AuthContext";

interface FileMetadata {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  s3Key: string;
  status: string;
  createdAt: string;
}

export default function Dashboard() {
  const [files, setFiles] = useState<FileMetadata[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [showUploadModal, setShowUploadModal] = useState(false);

  const { signout } = useAuth();
  const navigate = useNavigate();
  const { statusMessage, statusType, showStatus } = useStatusMessage();
  const {
    selectedFile,
    uploading,
    uploadProgress,
    selectFile,
    clearFile,
    startUpload,
    cancelUpload,
  } = useFileUpload();

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const fetchedFiles = await FileAPIService.fetchFiles();
      setFiles(fetchedFiles);
    } catch (error) {
      console.error("Error fetching files:", error);
      showStatus("Failed to load files", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleUpload = async () => {
    showStatus("Starting upload...", "info");
    const result = await startUpload();

    if (result.success) {
      showStatus("Upload completed successfully!", "success");
      setShowUploadModal(false);
      clearFile();
      await fetchFiles();
    } else {
      showStatus(`Upload failed: ${result.error || "Unknown error"}`, "error");
    }
  };

  const handleCancelUpload = async () => {
    await cancelUpload();
    showStatus("Upload cancelled", "info");
  };

  const handleDownload = async (file: FileMetadata) => {
    try {
      showStatus(`Downloading ${file.fileName}...`, "info");
      const url = await FileAPIService.getDownloadUrl(file.s3Key);

      const link = document.createElement("a");
      link.href = url;
      link.download = file.fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showStatus("Download started", "success");
    } catch (error) {
      console.error("Error downloading file:", error);
      showStatus("Failed to download file", "error");
    }
  };

  const handleDelete = async (fileId: string, fileName: string) => {
    if (!confirm(`Are you sure you want to delete "${fileName}"?`)) {
      return;
    }

    try {
      await FileAPIService.deleteFile(fileId);
      showStatus("File deleted successfully", "success");
      await fetchFiles();
    } catch (error) {
      console.error("Error deleting file:", error);
      showStatus("Failed to delete file", "error");
    }
  };

  const handleSignOut = async () => {
    try {
      signout();
    } catch (error) {
      console.error("Error signing out:", error);
    } finally {
      navigate("/auth", { replace: true });
    }
  };

  const handleCloseModal = () => {
    if (!uploading) {
      setShowUploadModal(false);
      clearFile();
    }
  };

  const filteredFiles = files.filter((file) =>
    file.fileName.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Navbar
        onUploadClick={() => setShowUploadModal(true)}
        onSignOut={handleSignOut}
      />

      {statusMessage && (
        <StatusMessage message={statusMessage} type={statusType} />
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-6">
          <SearchBar value={searchQuery} onChange={setSearchQuery} />
        </div>

        {loading ? (
          <LoadingSpinner />
        ) : filteredFiles.length === 0 ? (
          <EmptyState
            hasSearch={!!searchQuery}
            onUploadClick={
              !searchQuery ? () => setShowUploadModal(true) : undefined
            }
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredFiles.map((file) => (
              <FileCard
                key={file.fileId}
                file={file}
                onDownload={handleDownload}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>

      <UploadModal
        isOpen={showUploadModal}
        selectedFile={selectedFile}
        uploading={uploading}
        uploadProgress={uploadProgress}
        onClose={handleCloseModal}
        onFileSelect={selectFile}
        onUpload={handleUpload}
        onCancel={handleCancelUpload}
      />
    </div>
  );
}

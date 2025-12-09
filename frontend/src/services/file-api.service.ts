interface FileMetadata {
  fileId: string;
  fileName: string;
  mimeType: string;
  size: number;
  s3Key: string;
  status: string;
  createdAt: string;
}

const baseURL = import.meta.env.VITE_BASE_URL;

export class FileAPIService {
  static async fetchFiles(): Promise<FileMetadata[]> {
    const response = await fetch(`${baseURL}/files/list`, {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Failed to fetch files");
    }

    const data = await response.json();
    return data.files || [];
  }

  static async getDownloadUrl(s3Key: string): Promise<string> {
    const response = await fetch(`${baseURL}/files/get-download-url`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ s3_key: s3Key }),
    });

    if (!response.ok) {
      throw new Error("Failed to get download URL");
    }

    const data = await response.json();
    return data.url;
  }

  static async deleteFile(fileId: string): Promise<void> {
    const response = await fetch(`${baseURL}/files/delete`, {
      method: "DELETE",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });

    if (!response.ok) {
      throw new Error("Failed to delete file");
    }
  }

  static async signOut(): Promise<void> {
    await fetch(`${baseURL}/auth/signout`, {
      method: "GET",
      credentials: "include",
    });
  }
}

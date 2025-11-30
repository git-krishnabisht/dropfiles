export interface UploadProgress {
  uploadedChunks: number;
  totalChunks: number;
  percentage: number;
}

export interface UploadPart {
  ETag: string;
  PartNumber: number;
}


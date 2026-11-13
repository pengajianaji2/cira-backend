export interface CreateDesignAssetDto {
  uploadSessionId: string;
}

export interface CreateDesignAssetRecordInput {
  name: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  fileId: string;
  mimeType: string;
}

export interface CreateAssetUploadDto {
  name: string;
  originalSize: number;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

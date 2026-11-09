export interface CreateDesignAssetDto {
  name: string;
  originalSize: number;
  publicId: string;
  compressionRatio: number;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

export interface CreateDesignAssetRecordInput {
  name: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  storageReference: string;
  mimeType: string;
}

export interface CreateAssetUploadDto {
  name: string;
  originalSize: number;
  mimeType: "image/png" | "image/jpeg" | "image/webp";
}

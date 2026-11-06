export interface CreateDesignAssetDto {
  name: string;
  originalSize: number;
  compressedSize: number;
  compressionRatio: number;
  dataUrl: string;
  mimeType: string;
}

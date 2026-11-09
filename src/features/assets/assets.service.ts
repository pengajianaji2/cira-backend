import crypto from "node:crypto";
import { BadRequestError, NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { assetsRepository } from "./assets.repository.js";
import { CreateAssetUploadDto, CreateDesignAssetDto } from "./assets.types.js";
import { cloudinaryStorage } from "./cloudinary.service.js";

/** Service pengelolaan aset desain proyek menggunakan alur direct upload bertanda tangan Cloudinary. */
export const assetsService = {
  /** Mengambil daftar aset desain proyek beserta URL pengiriman bertanda tangan. */
  async getProjectAssets(projectId: string) {
    const project = await assetsRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const assets = await assetsRepository.findByProjectId(projectId);
    return assets.map((asset) => ({ ...asset, dataUrl: cloudinaryStorage.deliveryUrl(asset.storageReference) }));
  },

  /** Menerbitkan signature direct upload Cloudinary berumur singkat dengan UUID `publicId` khusus folder proyek. */
  async createUploadSignature(projectId: string, input: CreateAssetUploadDto) {
    const project = await assetsRepository.findProjectById(projectId);
    if (!project) throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    const publicId = crypto.randomUUID();
    const folder = `cira-pm/projects/${projectId}/assets`;
    return cloudinaryStorage.createUploadSignature(folder, publicId);
  },

  /** Menghapus unggahan sementara Cloudinary yatim jika belum tercatat sebagai aset desain proyek di DB. */
  async cleanupOrphanUpload(projectId: string, publicId: string) {
    const project = await assetsRepository.findProjectById(projectId);
    if (!project) throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    if (await assetsRepository.existsStorageReference(projectId, publicId)) return;
    const folder = `cira-pm/projects/${projectId}/assets`;
    try {
      const uploaded = await cloudinaryStorage.verifyUpload(folder, publicId);
      await cloudinaryStorage.destroy(cloudinaryStorage.toStoredReference("image", uploaded.format, uploaded.public_id));
    } catch {
      // No object was uploaded or it has already been removed.
    }
  },

  /** Memverifikasi objek terunggah (format & batas 2 MB) di Cloudinary lalu menyimpan metadata aset beserta log aktivitas. */
  async createAsset(
    projectId: string,
    dto: CreateDesignAssetDto,
    user?: AuthUserPayload
  ) {
    const project = await assetsRepository.findProjectById(projectId);
    if (!project) {
      throw new NotFoundError(`Proyek dengan ID '${projectId}' tidak ditemukan.`);
    }

    const folder = `cira-pm/projects/${projectId}/assets`;
    const uploaded = await cloudinaryStorage.verifyUpload(folder, dto.publicId);
    const expectedFormats: Record<string, string[]> = { "image/png": ["png"], "image/jpeg": ["jpg", "jpeg"], "image/webp": ["webp"] };
    if (uploaded.resource_type !== "image" || uploaded.bytes <= 0 || uploaded.bytes > 2_000_000 || !expectedFormats[dto.mimeType]?.includes(uploaded.format)) {
      await cloudinaryStorage.destroy(cloudinaryStorage.toStoredReference("image", uploaded.format, uploaded.public_id));
      throw new BadRequestError("File yang diunggah tidak sesuai batas ukuran atau tipe gambar yang diizinkan.");
    }
    const storedReference = cloudinaryStorage.toStoredReference("image", uploaded.format, uploaded.public_id);
    try {
      const asset = await assetsRepository.transaction(async (tx) => {
        const created = await assetsRepository.create(projectId, {
          name: dto.name,
          originalSize: dto.originalSize,
          compressedSize: uploaded.bytes,
          compressionRatio: dto.compressionRatio,
          storageReference: storedReference,
          mimeType: dto.mimeType,
        }, tx);
        await assetsRepository.logActivity({
          projectId,
          category: "asset",
          action: "UPLOAD",
          description: `Aset desain "${created.name}" berhasil diunggah (rasio kompresi ${created.compressionRatio}%).`,
          userId: user?.id,
          userName: user?.name,
          userRole: user?.roles?.[0],
          metadata: { assetId: created.id, name: created.name, originalSize: created.originalSize, compressedSize: created.compressedSize },
        }, tx);
        return created;
      });
      return { ...asset, dataUrl: cloudinaryStorage.deliveryUrl(asset.storageReference) };
    } catch (error) {
      await cloudinaryStorage.destroy(storedReference);
      throw error;
    }
  },

  /** Menghapus aset desain proyek, mencatat log aktivitas, lalu membersihkan objek di Cloudinary. */
  async deleteAsset(id: string, user?: AuthUserPayload) {
    const existing = await assetsRepository.findById(id);
    if (!existing) {
      throw new NotFoundError(`Aset desain dengan ID '${id}' tidak ditemukan.`);
    }

    await assetsRepository.transaction(async (tx) => {
      await assetsRepository.delete(id, tx);
      await assetsRepository.logActivity({
        projectId: existing.projectId,
        category: "asset",
        action: "DELETE",
        description: `Aset desain "${existing.name}" dihapus.`,
        userId: user?.id,
        userName: user?.name,
        userRole: user?.roles?.[0],
        metadata: { assetId: id, name: existing.name },
      }, tx);
    });
    await cloudinaryStorage.destroy(existing.storageReference);
    return { ...existing, dataUrl: cloudinaryStorage.deliveryUrl(existing.storageReference) };
  },
};

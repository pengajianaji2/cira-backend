import { v2 as cloudinary } from "cloudinary";
import { env } from "../../config/env.config.js";
import { ServiceUnavailableError } from "../../shared/errors/AppError.js";

const markerPrefix = "cloudinary://";
let configured = false;

const configure = () => {
  if (!env.CLOUDINARY_CLOUD_NAME || !env.CLOUDINARY_API_KEY || !env.CLOUDINARY_API_SECRET) {
    throw new ServiceUnavailableError("Cloudinary belum dikonfigurasi pada environment server.");
  }
  if (!configured) {
    cloudinary.config({
      cloud_name: env.CLOUDINARY_CLOUD_NAME,
      api_key: env.CLOUDINARY_API_KEY,
      api_secret: env.CLOUDINARY_API_SECRET,
      secure: true,
    });
    configured = true;
  }
};

/** Adapter penyimpanan dan pengiriman media terotentikasi Cloudinary untuk avatar dan aset desain. */
export const cloudinaryStorage = {
  /** Memeriksa apakah nilai string merupakan referensi penyimpanan Cloudinary (`cloudinary://...`). */
  isStoredReference(value: string | null | undefined): boolean {
    return Boolean(value?.startsWith(markerPrefix));
  },

  /** Mengunggah file/data URL secara authenticated ke folder Cloudinary tujuan dan mengembalikan referensi `cloudinary://...`. */
  async upload(dataUrl: string, folder: string): Promise<string> {
    configure();
    const uploaded = await cloudinary.uploader.upload(dataUrl, {
      folder,
      resource_type: "auto",
      type: "authenticated",
      access_mode: "authenticated",
      use_filename: false,
      unique_filename: true,
    });
    return `${markerPrefix}${uploaded.resource_type}:${uploaded.format}:${uploaded.public_id}`;
  },

  /** Menghasilkan signature unggah langsung berumur singkat untuk unggahan Cloudinary authenticated. */
  createUploadSignature(folder: string, publicId: string) {
    configure();
    const timestamp = Math.floor(Date.now() / 1000);
    const params = { folder, public_id: publicId, timestamp, type: "authenticated" };
    return {
      ...params,
      signature: cloudinary.utils.api_sign_request(params, env.CLOUDINARY_API_SECRET!),
      apiKey: env.CLOUDINARY_API_KEY!,
      cloudName: env.CLOUDINARY_CLOUD_NAME!,
    };
  },

  /** Memverifikasi keberadaan objek Cloudinary authenticated serta kesesuaian folder dan `publicId`-nya. */
  async verifyUpload(folder: string, publicId: string) {
    configure();
    let resource;
    try {
      resource = await cloudinary.api.resource(publicId, { resource_type: "image", type: "authenticated" });
    } catch {
      resource = await cloudinary.api.resource(`${folder}/${publicId}`, { resource_type: "image", type: "authenticated" });
    }
    const actualFolder = resource.folder ?? resource.asset_folder;
    const expectedPublicId = resource.public_id === publicId || resource.public_id === `${folder}/${publicId}`;
    if (actualFolder !== folder || !expectedPublicId) {
      throw new Error("Unggahan Cloudinary tidak sesuai dengan otorisasi.");
    }
    return resource as { bytes: number; format: string; resource_type: string; public_id: string };
  },

  /** Membentuk string referensi internal berformat `cloudinary://<resourceType>:<format>:<publicId>`. */
  toStoredReference(resourceType: string, format: string, publicId: string): string {
    return `${markerPrefix}${resourceType}:${format}:${publicId}`;
  },

  /** Menghasilkan delivery URL HTTPS bertanda tangan dari referensi `cloudinary://...` (atau mengembalikan URL non-referensi apa adanya). */
  deliveryUrl(reference: string): string {
    if (!this.isStoredReference(reference)) return reference;
    configure();
    const [resourceType, format, ...idParts] = reference.slice(markerPrefix.length).split(":");
    const publicId = idParts.join(":");
    if (!resourceType || !format || !publicId) throw new Error("Referensi Cloudinary tersimpan tidak valid.");
    return cloudinary.url(publicId, {
      secure: true,
      sign_url: true,
      type: "authenticated",
      resource_type: resourceType,
      format,
      version: undefined,
    });
  },

  /** Menghapus objek authenticated di Cloudinary berdasarkan referensi `cloudinary://...` yang tersimpan. */
  async destroy(reference: string): Promise<void> {
    if (!this.isStoredReference(reference)) return;
    configure();
    const [resourceType, _format, ...idParts] = reference.slice(markerPrefix.length).split(":");
    const publicId = idParts.join(":");
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
      type: "authenticated",
      invalidate: true,
    });
    if (result.result !== "ok" && result.result !== "not found") {
      throw new Error("Cloudinary gagal menghapus file.");
    }
  },
};

/** Menyelesaikan `avatarUrl` tersimpan (`cloudinary://...`) menjadi URL pengiriman HTTPS bertanda tangan. */
export function withResolvedUserAvatar<T extends { avatarUrl?: string | null }>(
  user: T | null | undefined,
): T | null | undefined {
  if (!user) return user;
  return {
    ...user,
    avatarUrl: user.avatarUrl ? cloudinaryStorage.deliveryUrl(user.avatarUrl) : null,
  };
}

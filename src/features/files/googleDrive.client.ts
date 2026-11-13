import { google } from "googleapis";
import { Readable } from "node:stream";
import { env } from "../../config/env.config.js";
import { ServiceUnavailableError } from "../../shared/errors/AppError.js";

let singleton: ReturnType<typeof google.drive> | undefined;
let oauth: InstanceType<typeof google.auth.OAuth2> | undefined;
function client() {
  if (
    !env.GOOGLE_CLIENT_ID ||
    !env.GOOGLE_CLIENT_SECRET ||
    !env.GOOGLE_REFRESH_TOKEN ||
    !env.GOOGLE_DRIVE_FOLDER_ID ||
    !env.FILE_SESSION_ENCRYPTION_KEY
  )
    throw new ServiceUnavailableError("Google Drive belum dikonfigurasi.");
  if (!singleton) {
    oauth = new google.auth.OAuth2(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
    oauth.setCredentials({ refresh_token: env.GOOGLE_REFRESH_TOKEN });
    singleton = google.drive({ version: "v3", auth: oauth });
  }
  return singleton;
}
async function authorizedFetch(url: string, init: RequestInit = {}) {
  client();
  const token = await oauth!.getAccessToken();
  return fetch(url, {
    ...init,
    redirect: "manual",
    signal: init.signal ?? AbortSignal.timeout(25000),
    headers: { ...init.headers, Authorization: `Bearer ${token.token}` },
  });
}
function upstreamError() {
  return new ServiceUnavailableError("Le service file sementara tidak tersedia. Coba kembali.");
}
export const googleDrive = {
  async newId() {
    const r = await client().files.generateIds({ count: 1, space: "drive" });
    return r.data.ids![0];
  },
  async assertPrivate(id: string) {
    const r = await client().permissions.list({
      fileId: id,
      fields: "permissions(type,role)",
      supportsAllDrives: true,
    });
    // Dedicated application folder: no domain/link/group/user shares inherited into documents.
    if (r.data.permissions?.some((p) => p.role !== "owner"))
      throw new ServiceUnavailableError("Folder Drive harus privat dan hanya dimiliki akun aplikasi.");
  },
  async ensureFolder(id: string, name: string) {
    try {
      await this.metadata(id);
      return;
    } catch (e) {
      if ((e as { code?: number }).code !== 404) throw e;
    }
    await this.assertPrivate(env.GOOGLE_DRIVE_FOLDER_ID!);
    await client().files.create({
      requestBody: { id, name, mimeType: "application/vnd.google-apps.folder", parents: [env.GOOGLE_DRIVE_FOLDER_ID!] },
      fields: "id",
    });
  },
  async begin(id: string, name: string, mimeType: string, size: number, folderId: string) {
    await this.assertPrivate(folderId);
    const r = await authorizedFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(size),
      },
      body: JSON.stringify({ id, name, mimeType, parents: [folderId] }),
    });
    const uri = r.headers.get("location");
    if (!r.ok || !uri) throw upstreamError();
    const u = new URL(uri);
    if (u.protocol !== "https:" || u.hostname !== "www.googleapis.com") throw upstreamError();
    return uri;
  },
  async send(uri: string, bytes: Buffer, start: number, total: number) {
    const r = await authorizedFetch(uri, {
      method: "PUT",
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Range": `bytes ${start}-${start + bytes.length - 1}/${total}`,
      },
      body: new Uint8Array(bytes),
    });
    if (r.status !== 308 && !r.ok) throw upstreamError();
    return this.offset(r, total);
  },
  offset(r: Response, total: number) {
    if (r.ok) return total;
    const range = r.headers.get("range");
    return range ? Number(range.match(/(\d+)$/)?.[1] ?? -1) + 1 : 0;
  },
  async probe(uri: string, total: number) {
    const r = await authorizedFetch(uri, {
      method: "PUT",
      headers: { "Content-Range": `bytes */${total}`, "Content-Length": "0" },
    });
    if (r.status !== 308 && !r.ok) throw upstreamError();
    return this.offset(r, total);
  },
  async metadata(id: string) {
    return (
      await client().files.get({
        fileId: id,
        fields: "id,name,mimeType,size,parents,md5Checksum,trashed",
        supportsAllDrives: true,
      })
    ).data;
  },
  async open(id: string, signal?: AbortSignal) {
    const r = await client().files.get({ fileId: id, alt: "media" }, { responseType: "stream", signal });
    return r.data as Readable;
  },
  async signature(id: string) {
    const r = await authorizedFetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(id)}?alt=media`, {
      headers: { Range: "bytes=0-15" },
    });
    if (!r.ok || !r.body) throw upstreamError();
    const reader = r.body.getReader();
    try {
      const { value } = await reader.read();
      return Buffer.from(value?.subarray(0, 16) ?? []);
    } finally {
      await reader.cancel();
    }
  },
  async remove(id: string) {
    try {
      await client().files.delete({ fileId: id, supportsAllDrives: true });
    } catch (e) {
      if ((e as { code?: number }).code !== 404) throw upstreamError();
    }
  },
};

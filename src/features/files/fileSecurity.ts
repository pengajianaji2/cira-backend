import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { env } from '../../config/env.config.js';
import { BadRequestError, ServiceUnavailableError } from '../../shared/errors/AppError.js';

export const MAX_CHUNK_BYTES = 4 * 1024 * 1024;
export const uploadSchema = z.object({
  category: z.enum(['AVATAR', 'DESIGN', 'PROOF', 'BAST', 'PRD', 'INVOICE']),
  projectId: z.string().uuid().optional(), paymentId: z.string().uuid().optional(), termId: z.string().uuid().optional(),
  name: z.string().min(1).max(255), mimeType: z.string(), sizeBytes: z.number().int().positive(),
  description: z.string().trim().max(500).optional(), originalSize: z.number().int().positive().max(20_000_000).optional(),
}).strict();
export type UploadInput = z.infer<typeof uploadSchema>;
const extensions: Record<string, string[]> = { 'image/jpeg': ['jpg', 'jpeg'], 'image/png': ['png'], 'image/webp': ['webp'], 'application/pdf': ['pdf'] };
export function safeFilename(name: string) {
  return name.replace(/[\u0000-\u001f\u007f/\\:"<>|?*]/g, '_').replace(/\.\./g, '_').trim().slice(0, 180) || 'file';
}
export function validateUpload(input: UploadInput) {
  const image = ['AVATAR', 'DESIGN'].includes(input.category);
  const pdf = ['PRD', 'INVOICE'].includes(input.category);
  const cap = input.category === 'AVATAR' ? env.FILE_UPLOAD_MAX_AVATAR_BYTES : input.category === 'DESIGN' ? env.FILE_UPLOAD_MAX_DESIGN_BYTES : env.FILE_UPLOAD_MAX_DOCUMENT_BYTES;
  if (input.sizeBytes > cap) throw new BadRequestError(`Ukuran file maksimal ${Math.floor(cap / 1048576)} MiB.`);
  if (!extensions[input.mimeType] || (image && !input.mimeType.startsWith('image/')) || (pdf && input.mimeType !== 'application/pdf')) throw new BadRequestError('Tipe file tidak diizinkan.');
  if (!extensions[input.mimeType].includes(input.name.split('.').pop()?.toLowerCase() || '')) throw new BadRequestError('Ekstensi file tidak sesuai dengan MIME.');
  if (/[\r\n/\\\u0000]/.test(input.name) || input.name.includes('..')) throw new BadRequestError('Nama file tidak valid.');
}
export function verifySignature(bytes: Buffer, mime: string) {
  const valid = mime === 'application/pdf' ? bytes.subarray(0, 5).toString() === '%PDF-' :
    mime === 'image/png' ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) :
    mime === 'image/jpeg' ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 :
    mime === 'image/webp' ? bytes.subarray(0,4).toString() === 'RIFF' && bytes.subarray(8,12).toString() === 'WEBP' : false;
  if (!valid) throw new BadRequestError('Signature file tidak cocok dengan tipe file.');
}
function key() {
  if (!env.FILE_SESSION_ENCRYPTION_KEY) throw new ServiceUnavailableError('Layanan file belum dikonfigurasi.');
  return Buffer.from(env.FILE_SESSION_ENCRYPTION_KEY, 'hex');
}
export function encryptUri(uri: string) {
  const iv=randomBytes(12), cipher=createCipheriv('aes-256-gcm',key(),iv);
  const ciphertext=Buffer.concat([cipher.update(uri,'utf8'),cipher.final()]);
  return Buffer.concat([iv,cipher.getAuthTag(),ciphertext]).toString('base64');
}
export function decryptUri(value: string) {
  const bytes=Buffer.from(value,'base64'), decipher=createDecipheriv('aes-256-gcm',key(),bytes.subarray(0,12));
  decipher.setAuthTag(bytes.subarray(12,28));
  return Buffer.concat([decipher.update(bytes.subarray(28)),decipher.final()]).toString('utf8');
}
export const filePath=(id?: string|null) => id ? `/api/v1/files/${id}` : null;
export function withResolvedUserAvatar<T extends { avatarFileId?: string|null }>(user:T|null|undefined) {
  return user ? {...user,avatarUrl:filePath(user.avatarFileId)} : user;
}

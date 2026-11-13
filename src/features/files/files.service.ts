import { FileUploadSession, StoredFile } from '@prisma/client';
import { prisma } from '../../config/db.config.js';
import { env } from '../../config/env.config.js';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError } from '../../shared/errors/AppError.js';
import { AuthUserPayload } from '../../shared/middlewares/auth.middleware.js';
import { policiesService } from '../auth/policies.service.js';
import { withResourceLock } from '../../shared/services/resourceLock.js';
import { googleDrive } from './googleDrive.client.js';
import { decryptUri, encryptUri, filePath, safeFilename, UploadInput, validateUpload, verifySignature } from './fileSecurity.js';

const writePermission={AVATAR:'',DESIGN:'assets.write',PROOF:'finance.write',BAST:'finance.payment_terms.manage',PRD:'prd.write',INVOICE:'finance.invoices.create'};
type Context={category:keyof typeof writePermission;projectId?:string|null;paymentId?:string|null;termId?:string|null;ownerUserId?:string|null};
async function authorize(context:Context,user:AuthUserPayload,write:boolean) {
  if(context.category==='AVATAR') {
    if(context.projectId||context.paymentId||context.termId)throw new BadRequestError('Avatar tidak boleh terhubung ke proyek.');
    if(context.ownerUserId && context.ownerUserId!==user.id && (write||!await policiesService.hasAny(user.roles,'directory.read')))throw new ForbiddenError('Akses file ditolak.');
    return;
  }
  if(!context.projectId)throw new BadRequestError('Proyek wajib diisi.');
  const global=user.roles.some(r=>['owner','operasional','ops'].includes(r));
  const p=await prisma.project.findFirst({where:{id:context.projectId,...(global?{}:{roster:{some:{userId:user.id}}})},select:{id:true,deletionState:true}});
  if(!p)throw new NotFoundError('Proyek tidak ditemukan.');
  if(write&&p.deletionState)throw new ConflictError('Proyek sedang dalam proses penghapusan.');
  const permission=write?writePermission[context.category]:['PROOF','BAST','INVOICE'].includes(context.category)?'finance.read':'projects.read';
  if(!await policiesService.hasAny(user.roles,permission))throw new ForbiddenError('Akses file ditolak.');
  if(context.category==='PROOF') {
    if(!context.paymentId||context.termId||!await prisma.payment.findFirst({where:{id:context.paymentId,projectId:context.projectId}}))throw new BadRequestError('Pembayaran tidak sesuai proyek.');
  } else if(['BAST','INVOICE'].includes(context.category)) {
    const term=context.termId?await prisma.paymentTerm.findFirst({where:{id:context.termId,projectId:context.projectId}}):null;
    if(!term||context.paymentId)throw new BadRequestError('Termin tidak sesuai proyek.');
    if(write&&context.category==='BAST'&&term.isLocked)throw new ConflictError('BAST pada termin terkunci tidak dapat diubah.');
  } else if(context.paymentId||context.termId)throw new BadRequestError('Konteks file tidak valid.');
}
const lockKey=(s:{projectId?:string|null;userId:string})=>s.projectId?`project:${s.projectId}`:`avatar:${s.userId}`;
function publicSession(s:FileUploadSession){return {id:s.id,offset:s.offset,sizeBytes:s.sizeBytes,status:s.status,chunkBytes:env.FILE_UPLOAD_CHUNK_BYTES,expiresAt:s.expiresAt,fileId:s.resultFileId};}
async function ownedSession(id:string,user:AuthUserPayload){const s=await prisma.fileUploadSession.findUnique({where:{id}});if(!s||s.userId!==user.id)throw new NotFoundError('Sesi upload tidak ditemukan.');return s;}
async function live(s:FileUploadSession,user:AuthUserPayload){await authorize(s,user,true);if(s.expiresAt<new Date()||!['UPLOADING','UPLOADED','COMPLETED'].includes(s.status))throw new ConflictError('Sesi berakhir atau dibatalkan. Batalkan sesi lalu unggah kembali.');}
async function cleanupSession(s:FileUploadSession){
  try {await googleDrive.remove(s.driveFileId);await prisma.fileUploadSession.update({where:{id:s.id},data:{status:'CANCELLED',encryptedUri:null}});}
  catch {await prisma.fileUploadSession.update({where:{id:s.id},data:{status:'CLEANUP_PENDING'}});throw new ServiceUnavailableError('Cleanup file belum selesai. Sesi tetap tercatat untuk percobaan ulang.');}
}
export const filesService={
  async begin(input:UploadInput,user:AuthUserPayload){
    validateUpload(input);
    if(!input.projectId&&input.paymentId) input.projectId=(await prisma.payment.findUnique({where:{id:input.paymentId},select:{projectId:true}}))?.projectId;
    if(!input.projectId&&input.termId) input.projectId=(await prisma.paymentTerm.findUnique({where:{id:input.termId},select:{projectId:true}}))?.projectId;
    await authorize(input,user,true);
    return withResourceLock(lockKey({...input,userId:user.id}),async()=>{
      await authorize(input,user,true);
      // Fail before creating Drive objects if the session key is unavailable.
      encryptUri('configuration-check');
      let folderId=env.GOOGLE_DRIVE_FOLDER_ID;
      if(!folderId)throw new BadRequestError('Folder Google Drive belum dikonfigurasi.');
      if(input.projectId){
        const p=await prisma.project.findUniqueOrThrow({where:{id:input.projectId}});
        folderId=p.driveFolderId??await googleDrive.newId();
        if(!p.driveFolderId)await prisma.project.update({where:{id:p.id},data:{driveFolderId:folderId}});
        await googleDrive.ensureFolder(folderId,`CIRA-${p.id}`);
      }
      const driveFileId=await googleDrive.newId();
      const storageName=`${Date.now()}-${input.category}-${input.projectId??user.id}-${safeFilename(input.name)}`;
      const s=await prisma.fileUploadSession.create({data:{userId:user.id,projectId:input.projectId,paymentId:input.paymentId,termId:input.termId,category:input.category,originalName:safeFilename(input.name),storageName,mimeType:input.mimeType,sizeBytes:input.sizeBytes,description:input.description,originalSize:input.originalSize,driveFileId,folderId,expiresAt:new Date(Date.now()+24*3600_000)}});
      try {
        const uri=await googleDrive.begin(driveFileId,storageName,input.mimeType,input.sizeBytes,folderId);
        return publicSession(await prisma.fileUploadSession.update({where:{id:s.id},data:{encryptedUri:encryptUri(uri),status:'UPLOADING'}}));
      }catch(e){await cleanupSession(s).catch(()=>undefined);throw e;}
    });
  },
  async status(id:string,user:AuthUserPayload){
    const original=await ownedSession(id,user);
    return withResourceLock(lockKey(original),async()=>{
      const s=await ownedSession(id,user);
      if(s.status==='CANCELLED')return publicSession(s);
      if(s.status==='COMPLETED')return publicSession(s);
      if(s.status==='CLEANUP_PENDING'||s.expiresAt<new Date()){
        await cleanupSession(s);
        return publicSession(await prisma.fileUploadSession.findUniqueOrThrow({where:{id}}));
      }
      await live(s,user);
      const offset=await googleDrive.probe(decryptUri(s.encryptedUri!),s.sizeBytes);
      return publicSession(await prisma.fileUploadSession.update({where:{id},data:{offset,status:offset===s.sizeBytes?'UPLOADED':'UPLOADING'}}));
    });
  },
  async chunk(id:string,range:string|undefined,bytes:Buffer,user:AuthUserPayload){
    const original=await ownedSession(id,user);
    return withResourceLock(lockKey(original),async()=>{
      const s=await ownedSession(id,user);await live(s,user);
      if(s.status==='COMPLETED')return publicSession(s);
      const match=range?.match(/^bytes (\d+)-(\d+)\/(\d+)$/);
      if(!match||!Buffer.isBuffer(bytes)||!bytes.length||bytes.length>env.FILE_UPLOAD_CHUNK_BYTES)throw new BadRequestError('Chunk atau Content-Range tidak valid.');
      const [start,end,total]=match.slice(1).map(Number);
      if(total!==s.sizeBytes||end-start+1!==bytes.length||end>=total||start>end||(end+1<total&&bytes.length%262144!==0))throw new BadRequestError('Rentang atau ukuran chunk tidak valid.');
      // Query Drive before every retry/write; persisted offsets are only a cache.
      const uri=decryptUri(s.encryptedUri!);
      let offset=await googleDrive.probe(uri,total);
      if(start!==offset){await prisma.fileUploadSession.update({where:{id},data:{offset}});return {...publicSession(s),offset};}
      if(start===0)verifySignature(bytes,s.mimeType);
      if(start>0&&!s.signatureVerified)throw new ConflictError('Signature awal belum diverifikasi. Batalkan dan ulangi upload.');
      if(start===0)await prisma.fileUploadSession.update({where:{id},data:{signatureVerified:true}});
      try{offset=await googleDrive.send(uri,bytes,start,total);}
      catch(e){try{offset=await googleDrive.probe(uri,total);}catch{throw e;}}
      return publicSession(await prisma.fileUploadSession.update({where:{id},data:{offset,status:offset===total?'UPLOADED':'UPLOADING'}}));
    });
  },
  async complete(id:string,user:AuthUserPayload,expected?:{category:string;projectId?:string},resourceLockHeld=false){
    const original=await ownedSession(id,user);
    if(expected&&(original.category!==expected.category||(expected.projectId!==undefined&&original.projectId!==expected.projectId)))throw new NotFoundError('Sesi upload tidak ditemukan.');
    const work=async()=>{
      const s=await ownedSession(id,user);await live(s,user);
      if(s.status==='COMPLETED')return {fileId:s.resultFileId,url:filePath(s.resultFileId)};
      const meta=await googleDrive.metadata(s.driveFileId);
      if(meta.trashed||meta.id!==s.driveFileId||Number(meta.size)!==s.sizeBytes||meta.mimeType!==s.mimeType||meta.name!==s.storageName||!meta.parents?.includes(s.folderId)){
        await cleanupSession(s);throw new BadRequestError('Verifikasi metadata file gagal.');
      }
      await googleDrive.assertPrivate(s.driveFileId);
      try{verifySignature(await googleDrive.signature(s.driveFileId),s.mimeType);}catch(e){await cleanupSession(s);throw e;}
      let oldFileId:string|null=null;
      let result;
      try {
        result=await prisma.$transaction(async tx=>{
          const file=await tx.storedFile.create({data:{driveFileId:s.driveFileId,originalName:s.originalName,storageName:s.storageName,mimeType:s.mimeType,sizeBytes:s.sizeBytes,checksum:meta.md5Checksum,category:s.category,uploaderId:user.id,projectId:s.projectId,ownerUserId:s.category==='AVATAR'?user.id:null}});
          switch(s.category){
            case 'AVATAR': {const u=await tx.user.findUniqueOrThrow({where:{id:user.id}});oldFileId=u.avatarFileId;await tx.user.update({where:{id:user.id},data:{avatarFileId:file.id}});break;}
            case 'DESIGN': await tx.designAsset.create({data:{projectId:s.projectId!,fileId:file.id,name:s.originalName,mimeType:s.mimeType,originalSize:s.originalSize??s.sizeBytes,compressedSize:s.sizeBytes,compressionRatio:Math.max(0,Math.round(100*(1-s.sizeBytes/(s.originalSize??s.sizeBytes))))}});break;
            case 'PRD': {const last=await tx.projectPrdVersion.findFirst({where:{projectId:s.projectId!},orderBy:{versionNumber:'desc'},select:{versionNumber:true}});await tx.projectPrdVersion.create({data:{projectId:s.projectId!,fileId:file.id,versionNumber:(last?.versionNumber??0)+1,description:s.description,createdById:user.id}});break;}
            case 'PROOF': {const p=await tx.payment.findUniqueOrThrow({where:{id:s.paymentId!}});oldFileId=p.proofFileId;await tx.payment.update({where:{id:p.id},data:{proofFileId:file.id,proofFileName:s.originalName,proofUploadedAt:new Date()}});break;}
            case 'BAST': case 'INVOICE': {const t=await tx.paymentTerm.findUniqueOrThrow({where:{id:s.termId!}});oldFileId=s.category==='BAST'?t.bastFileId:t.invoiceFileId;await tx.paymentTerm.update({where:{id:t.id},data:s.category==='BAST'?{bastFileId:file.id,bastFileName:s.originalName,bastUploadedAt:new Date()}:{invoiceFileId:file.id}});break;}
          }
          if(oldFileId)await tx.storedFile.update({where:{id:oldFileId},data:{status:'DELETE_PENDING'}});
          if(s.projectId)await tx.activityLog.create({data:{projectId:s.projectId,category:['PROOF','BAST','INVOICE'].includes(s.category)?'finance':'asset',action:'FILE_UPLOAD',description:`${s.category}: ${s.originalName}`,userId:user.id,userName:user.name,metadata:{fileId:file.id,sizeBytes:file.sizeBytes}}});
          await tx.fileUploadSession.update({where:{id},data:{status:'COMPLETED',resultFileId:file.id,encryptedUri:null,offset:s.sizeBytes}});
          return {fileId:file.id,url:filePath(file.id)};
        });
      }catch(e){
        // Resolve an ambiguous DB commit before deleting a potentially attached file.
        const committed=await prisma.fileUploadSession.findUnique({where:{id}});
        if(committed?.status==='COMPLETED')return {fileId:committed.resultFileId,url:filePath(committed.resultFileId)};
        await cleanupSession(s).catch(()=>undefined);throw e;
      }
      if(oldFileId)await this.removePhysical(oldFileId).catch(()=>undefined);
      return result;
    };
    return resourceLockHeld?work():withResourceLock(lockKey(original),work);
  },
  async cancel(id:string,user:AuthUserPayload){const s=await ownedSession(id,user);return withResourceLock(lockKey(s),async()=>{if(s.status==='COMPLETED')return;await cleanupSession(s);});},
  async getFile(id:string,user:AuthUserPayload){
    const file=await prisma.storedFile.findUnique({where:{id},include:{proofFor:{select:{id:true}},bastFor:{select:{id:true}},invoiceFor:{select:{id:true}}}});
    if(!file||file.status!=='ACTIVE')throw new NotFoundError('File tidak ditemukan.');
    await authorize({...file,paymentId:file.proofFor?.id,termId:file.bastFor?.id??file.invoiceFor?.id},user,false);return file;
  },
  async removePhysical(id:string){
    const f=await prisma.storedFile.findUnique({where:{id}});if(!f)return;
    try{await googleDrive.remove(f.driveFileId);}catch(e){await prisma.storedFile.update({where:{id},data:{status:'DELETE_PENDING'}});throw e;}
    await prisma.$transaction(async tx=>{await tx.designAsset.deleteMany({where:{fileId:id}});await tx.storedFile.delete({where:{id}});});
  },
  async remove(id:string,user:AuthUserPayload){
    const f=await prisma.storedFile.findUnique({where:{id},include:{proofFor:true,bastFor:true,invoiceFor:true}});if(!f)return;
    if(f.category==='PRD')throw new ForbiddenError('Versi PRD immutable; hapus melalui penghapusan proyek.');
    return withResourceLock(lockKey({projectId:f.projectId,userId:f.ownerUserId??user.id}),async()=>{
      // Detached replacements remain retryable by their uploader/owner.
      if(f.status==='DELETE_PENDING'&&!f.proofFor&&!f.bastFor&&!f.invoiceFor){if(f.uploaderId!==user.id&&!user.roles.includes('owner'))throw new ForbiddenError('Akses ditolak.');}
      else await authorize({...f,paymentId:f.proofFor?.id,termId:f.bastFor?.id??f.invoiceFor?.id},user,true);
      await this.removePhysical(id);
    });
  },
};

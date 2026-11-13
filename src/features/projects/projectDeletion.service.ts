import bcrypt from 'bcryptjs';
import { prisma } from '../../config/db.config.js';
import { UnauthorizedError, NotFoundError, ConflictError, ServiceUnavailableError } from '../../shared/errors/AppError.js';
import { AuthUserPayload } from '../../shared/middlewares/auth.middleware.js';
import { googleDrive } from '../files/googleDrive.client.js';

async function verifyPassword(userId:string,password:string){
  const user=await prisma.user.findUnique({where:{id:userId},select:{passwordHash:true}});
  if(!user||!await bcrypt.compare(password,user.passwordHash)){
    // Failed checks are persisted by user/IP in a short window; never log the password.
    const {createHmac}=await import('node:crypto');
    const keyHash=createHmac('sha256',process.env.JWT_SECRET!).update(`project-delete:${userId}`).digest('hex');
    const result=await prisma.$queryRaw<Array<{count:number}>>`INSERT INTO "auth_rate_limits" ("keyHash","count","resetAt","updatedAt") VALUES (${keyHash},1,NOW()+INTERVAL '15 minutes',NOW()) ON CONFLICT ("keyHash") DO UPDATE SET "count"=CASE WHEN "auth_rate_limits"."resetAt"<=NOW() THEN 1 ELSE "auth_rate_limits"."count"+1 END,"resetAt"=CASE WHEN "auth_rate_limits"."resetAt"<=NOW() THEN NOW()+INTERVAL '15 minutes' ELSE "auth_rate_limits"."resetAt" END,"updatedAt"=NOW() RETURNING "count"`;
    if(result[0].count>10)throw new ServiceUnavailableError('Terlalu banyak percobaan password. Coba lagi 15 menit lagi.');
    throw new UnauthorizedError('Password Owner tidak sesuai.');
  }
  const {createHmac}=await import('node:crypto');const keyHash=createHmac('sha256',process.env.JWT_SECRET!).update(`project-delete:${userId}`).digest('hex');
  await prisma.$executeRaw`DELETE FROM "auth_rate_limits" WHERE "keyHash"=${keyHash}`;
}

async function removeProjectRecords(projectId:string,jobId:string,actor:AuthUserPayload){
  return prisma.$transaction(async tx=>{
    const job=await tx.projectDeletionJob.findUniqueOrThrow({where:{id:jobId}});
    const project=await tx.project.findUnique({where:{id:projectId},select:{id:true,name:true}});
    if(!project){await tx.projectDeletionJob.update({where:{id:jobId},data:{state:'COMPLETED',completedAt:new Date()}});return;}
    const fileIds=(await tx.storedFile.findMany({where:{projectId},select:{id:true}})).map(f=>f.id);
    await tx.projectDeletionAudit.create({data:{projectSnapshotId:job.projectSnapshotId,projectName:job.projectName,actorId:actor.id,result:'COMPLETED'}});
    await tx.activityLog.deleteMany({where:{projectId}});
    await tx.projectPrdVersion.deleteMany({where:{projectId}});
    await tx.designAsset.deleteMany({where:{projectId}});
    await tx.storedFile.deleteMany({where:{id:{in:fileIds}}});
    await tx.project.delete({where:{id:projectId}});
    await tx.projectDeletionItem.deleteMany({where:{jobId}});
    await tx.projectDeletionJob.update({where:{id:jobId},data:{state:'COMPLETED',completedAt:new Date(),failureCode:null}});
  });
}

export const projectDeletionService={
  async delete(projectId:string,password:string,actor:AuthUserPayload){
    await verifyPassword(actor.id,password);
    let job=await prisma.projectDeletionJob.findUnique({where:{projectSnapshotId:projectId}});
    if(job?.state==='COMPLETED')return {jobId:job.id,state:'COMPLETED',remaining:0,projectName:job.projectName,counts:null};
    let project=await prisma.project.findUnique({where:{id:projectId},include:{storedFiles:{select:{driveFileId:true}},_count:{select:{tasks:true,sprints:true,payments:true,paymentTerms:true,assets:true,repositoryLinks:true,prdVersions:true,roster:true,statusRequests:true,operationalEvents:true}}}});
    if(!project)throw new NotFoundError('Proyek tidak ditemukan.');
    if(!job){
      job=await prisma.$transaction(async tx=>{
        const created=await tx.projectDeletionJob.create({data:{projectSnapshotId:projectId,projectName:project.name,actorId:actor.id,state:'FILES_CLEANING'}});
        await tx.projectDeletionItem.createMany({data:project!.storedFiles.map(f=>({jobId:created.id,driveFileId:f.driveFileId}))});
        if(project!.driveFolderId)await tx.projectDeletionItem.create({data:{jobId:created.id,driveFileId:project!.driveFolderId,kind:'FOLDER'}});
        await tx.project.update({where:{id:projectId},data:{deletionState:'FILES_CLEANING'}});
        const activeSessions=await tx.fileUploadSession.findMany({where:{projectId,status:{in:['INITIALIZING','UPLOADING','UPLOADED','CLEANUP_PENDING']}},select:{driveFileId:true}});
        const known=new Set(project!.storedFiles.map(f=>f.driveFileId));
        await tx.projectDeletionItem.createMany({data:activeSessions.filter(f=>!known.has(f.driveFileId)).map(f=>({jobId:created.id,driveFileId:f.driveFileId}))});
        await tx.fileUploadSession.updateMany({where:{projectId,status:{in:['INITIALIZING','UPLOADING','UPLOADED','CLEANUP_PENDING']}},data:{status:'CANCELLED',encryptedUri:null}});
        return created;
      });
    }
    if(!project.deletionState)await prisma.project.update({where:{id:projectId},data:{deletionState:'FILES_CLEANING'}});
    await prisma.projectDeletionJob.update({where:{id:job.id},data:{state:'FILES_CLEANING',failureCode:null}});
    // Keep work under a Vercel invocation; the Owner can repeat this endpoint to resume.
    const pending=await prisma.projectDeletionItem.findMany({where:{jobId:job.id,done:false},take:3,orderBy:[{kind:'asc'},{id:'asc'}]});
    for(const item of pending){
      try{
        await googleDrive.remove(item.driveFileId);
        await prisma.projectDeletionItem.update({where:{id:item.id},data:{done:true}});
      }catch{
        await prisma.projectDeletionJob.update({where:{id:job.id},data:{state:'FAILED_RETRYABLE',failureCode:'DRIVE_UNAVAILABLE'}});
        return {jobId:job.id,state:'FAILED_RETRYABLE',remaining:await prisma.projectDeletionItem.count({where:{jobId:job.id,done:false}}),projectName:job.projectName,counts:project._count};
      }
    }
    const remaining=await prisma.projectDeletionItem.count({where:{jobId:job.id,done:false}});
    if(remaining)return {jobId:job.id,state:'FILES_CLEANING',remaining,projectName:project.name,counts:project._count};
    await prisma.projectDeletionJob.update({where:{id:job.id},data:{state:'DB_CLEANUP'}});
    await removeProjectRecords(projectId,job.id,actor);
    return {jobId:job.id,state:'COMPLETED',remaining:0,projectName:project.name,counts:project._count};
  },
};

import { ConflictError, NotFoundError } from "../../shared/errors/AppError.js";
import { AuthUserPayload } from "../../shared/middlewares/auth.middleware.js";
import { policiesService } from "../auth/policies.service.js";
import { filePath, withResolvedUserAvatar } from "../files/fileSecurity.js";
import { projectsRepository, ProjectVisibilityScope } from "./projects.repository.js";
import { CreateProjectDto, ProjectListingQuery, ProjectQueryFilter, UpdateProjectDto } from "./projects.types.js";
import { prisma } from "../../config/db.config.js";

const visibilityScope = (user: AuthUserPayload): ProjectVisibilityScope => {
  const roles = user.roles.map((role) => role === "ops" ? "operasional" : role === "dev" ? "developer" : role);
  return { userId: user.id, organizationWide: roles.includes("owner") || roles.includes("operasional") };
};
const presentProject = <T extends { contractValue: unknown; owner?: { avatarFileId?: string|null }|null; _count?: Record<string, number>; activities?: any[] }>(project:T, canReadFinance=true) => ({ ...project, contractValue:canReadFinance?Number(project.contractValue):undefined, owner:withResolvedUserAvatar(project.owner), ...(project._count&&!canReadFinance?{_count:Object.fromEntries(Object.entries(project._count).filter(([key])=>!['payments','paymentTerms','storedFiles'].includes(key)))}:{}), ...(project.activities&&!canReadFinance?{activities:project.activities.filter(a=>a.category!=='finance')}: {}) });
export const projectsService = {
  async getAllProjects(filters:ProjectQueryFilter,user:AuthUserPayload){const canRead=await policiesService.hasAny(user.roles,"finance.read");return (await projectsRepository.findMany(filters,visibilityScope(user))).map(p=>presentProject(p,canRead));},
  async getProjectPage(filters:ProjectListingQuery,user:AuthUserPayload){const [result,canRead]=await Promise.all([projectsRepository.findPage(filters,visibilityScope(user)),policiesService.hasAny(user.roles,"finance.read")]);return {...result,items:result.items.map(p=>presentProject(p,canRead)),page:filters.page,pageSize:filters.limit,totalPages:Math.ceil(result.total/filters.limit)};},
  async getProjectById(id:string,user:AuthUserPayload){
    const project=await projectsRepository.findById(id);if(!project)throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    const canReadFinance=await policiesService.hasAny(user.roles,'finance.read');
    return presentProject({...project,owner:withResolvedUserAvatar(project.owner),roster:project.roster?.map(m=>({...m,user:withResolvedUserAvatar(m.user)})),statusRequests:project.statusRequests?.map(r=>({...r,votes:r.votes?.map(v=>({...v,user:withResolvedUserAvatar(v.user)}))})),payments:canReadFinance?project.payments?.map(p=>{const {proof,...safePayment}=p;return {...safePayment,amount:Number(p.amount),proofUrl:filePath(p.proofFileId),proofMimeType:proof?.mimeType??null};}):[],activities:canReadFinance?project.activities:project.activities?.filter(a=>a.category!=="finance")},canReadFinance);
  },
  async createProject(dto:CreateProjectDto,user?:AuthUserPayload){
    const project=await prisma.$transaction(async tx=>{
      const created=await projectsRepository.create({...dto,ownerId:user?.id},tx);
      if(user?.id)await tx.projectRoster.create({data:{projectId:created.id,userId:user.id,roleInProject:user.roles?.[0]||'owner'}});
      await projectsRepository.logActivity({projectId:created.id,category:'project',action:'CREATE',description:`Proyek "${created.name}" berhasil dibuat.`,userId:user?.id,userName:user?.name,userRole:user?.roles?.[0],metadata:{clientName:created.clientName,status:created.status,repoType:created.repoType}},tx);
      return created;
    });return presentProject(project,user?await policiesService.hasAny(user.roles,"finance.read"):false);
  },
  async updateProject(id:string,dto:UpdateProjectDto,user?:AuthUserPayload){
    const existing=await projectsRepository.findById(id);if(!existing)throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    const updated=await prisma.$transaction(async tx=>{
      const result=await projectsRepository.update(id,dto,tx);
      await projectsRepository.logActivity({projectId:id,category:'project',action:'UPDATE',description:`Informasi proyek "${result.name}" diperbarui.`,userId:user?.id,userName:user?.name,userRole:user?.roles?.[0],metadata:dto as any},tx);return result;
    });return presentProject(updated,user?await policiesService.hasAny(user.roles,"finance.read"):false);
  },
  async updateContractValue(id:string,contractValue:number,user?:AuthUserPayload){
    const existing=await projectsRepository.findById(id);if(!existing)throw new NotFoundError(`Proyek dengan ID '${id}' tidak ditemukan.`);
    const hasIssued=await prisma.paymentTerm.findFirst({where:{projectId:id,OR:[{status:{in:['invoiced','paid']}},{isLocked:true},{invoiceNumber:{not:null}}]},select:{id:true}});
    if(hasIssued)throw new ConflictError('Nilai kontrak tidak dapat diubah setelah invoice resmi diterbitkan.');
    const updated=await prisma.$transaction(async tx=>{const result=await projectsRepository.updateContractValue(id,contractValue,tx);await projectsRepository.logActivity({projectId:id,category:'finance',action:'CONTRACT_VALUE_CHANGE',description:'Nilai kontrak proyek diperbarui.',userId:user?.id,userName:user?.name,userRole:user?.roles?.[0],metadata:{previousValue:Number(existing.contractValue),newValue:contractValue}},tx);return result;});
    return {contractValue:Number(updated.contractValue)};
  },
};

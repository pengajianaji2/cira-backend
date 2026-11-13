import { Router, raw } from 'express';
import { pipeline } from 'node:stream/promises';
import { requireAuth } from '../../shared/middlewares/auth.middleware.js';
import { validateRequest } from '../../shared/middlewares/validateRequest.js';
import { asyncHandler } from '../../shared/utils/asyncHandler.js';
import { sendSuccess } from '../../shared/utils/responseFormatter.js';
import { filesService } from './files.service.js';
import { MAX_CHUNK_BYTES, safeFilename, uploadSchema } from './fileSecurity.js';
import { googleDrive } from './googleDrive.client.js';

const router=Router();router.use(requireAuth);
router.post('/upload-sessions',validateRequest({body:uploadSchema}),asyncHandler(async(req,res)=>sendSuccess(res,'Sesi upload siap.',await filesService.begin(req.body,req.user!),201)));
router.get('/upload-sessions/:id',asyncHandler(async(req,res)=>sendSuccess(res,'Posisi upload terverifikasi.',await filesService.status(String(req.params.id),req.user!))));
router.put('/upload-sessions/:id/chunks',raw({type:'application/octet-stream',limit:MAX_CHUNK_BYTES}),asyncHandler(async(req,res)=>sendSuccess(res,'Chunk diterima.',await filesService.chunk(String(req.params.id),req.get('Content-Range'),req.body,req.user!))));
router.post('/upload-sessions/:id/complete',asyncHandler(async(req,res)=>sendSuccess(res,'File berhasil disimpan.',await filesService.complete(String(req.params.id),req.user!))));
router.delete('/upload-sessions/:id',asyncHandler(async(req,res)=>{await filesService.cancel(String(req.params.id),req.user!);return sendSuccess(res,'Sesi dibatalkan.',null);}));
router.delete('/:id',asyncHandler(async(req,res)=>{await filesService.remove(String(req.params.id),req.user!);return sendSuccess(res,'File dihapus.',null);}));
router.get('/:id',asyncHandler(async(req,res)=>{
  const f=await filesService.getFile(String(req.params.id),req.user!);
  const abort=new AbortController();res.once('close',()=>abort.abort());
  const stream=await googleDrive.open(f.driveFileId,abort.signal);
  const mode=req.query.mode==='download'?'attachment':'inline';
  const filename=safeFilename(f.originalName);
  res.set({'Content-Type':f.mimeType,'Content-Length':String(f.sizeBytes),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'cross-origin','Content-Disposition':`${mode}; filename="${filename.replace(/[^\x20-\x7E]/g,'_')}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g,c=>'%'+c.charCodeAt(0).toString(16))}`});
  try{await pipeline(stream,res);}catch(e){stream.destroy();if(!res.headersSent)throw e;res.destroy();}
}));
export default router;

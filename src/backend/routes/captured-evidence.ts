import { Router, type RequestHandler } from 'express';
import {requireStaffMutation} from '../middleware/staffMutation';
import {previewAssetLinks,applyAssetLinks,projectImplementation} from '../services/assetLinks.service';
import multer from 'multer';
import { previewCapturedEvidence, applyCapturedEvidence, listCapturedEvidence, capturedEvidenceChecks } from '../services/capturedEvidence.service';
import { handleRouteError } from './routeErrors';
const router = Router({ mergeParams: true });
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024, files: 1 } }).single('file');
router.get('/', (req,res) => { try { res.json(listCapturedEvidence(req.projectId!)); } catch(e) { handleRouteError(e,res); } });
const staff:RequestHandler=(req,res,next)=>{if(!req.userId||!req.userName){res.status(401).json({error:'Staff identity required.'});return;}next();};
router.get('/implementation',staff,(req,res)=>{try{res.json(projectImplementation(req.projectId!));}catch(e){handleRouteError(e,res);}});
for(const mode of ['preview','apply'])router.post('/links/'+mode,requireStaffMutation,(req,res)=>{try{
  res.json(mode==='preview'?previewAssetLinks(req.projectId!,req.body?.package):applyAssetLinks(req.projectId!,req.body?.package,String(req.body?.payload_hash??''),req.userName!,req.body?.human_confirmed===true));
}catch(e){handleRouteError(e,res);}});
router.get('/checks', (req,res) => { try { res.json(capturedEvidenceChecks(req.projectId!)); } catch(e) { handleRouteError(e,res); } });
for (const mode of ['preview','apply']) router.post('/'+mode, requireStaffMutation, upload, async (req,res) => {
  try {
    if (!req.file) { res.status(400).json({error:'file is required'}); return; }
    const sourceProject = typeof req.body.source_project_id === 'string' ? req.body.source_project_id : '';
    res.json(mode === 'preview' ? await previewCapturedEvidence(req.projectId!,req.file.buffer,req.file.originalname,sourceProject) : await applyCapturedEvidence(req.projectId!,req.file.buffer,req.file.originalname,sourceProject,String(req.body?.payload_hash ?? ''),req.userName ?? null));
  } catch(e) { handleRouteError(e,res); }
});
router.use((err: any,_req: any,res: any,next: any) => { if (err instanceof multer.MulterError) res.status(400).json({error:'Upload exceeds limits or has an invalid field.',code:'UPLOAD_ERROR'}); else next(err); });
export default router;

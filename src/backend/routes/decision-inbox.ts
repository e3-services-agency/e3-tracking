import { Router } from 'express';
import {requireStaffMutation} from '../middleware/staffMutation';
import { actOnDecision, importDecision, listDecisions, previewDecision, previewDecisionSources, reviewDecisionSources,previewDecisionReconciliation,applyDecisionReconciliation } from '../services/decisionInbox.service';
import { handleRouteError } from './routeErrors';
const router=Router({mergeParams:true});
router.use((req,res,next)=>{
  if(process.env.DECISION_INBOX_ENABLED!=='true') {res.status(404).json({error:'Decision inbox is not enabled on this installation.'});return;}
  if(!req.userId || !req.userName) {res.status(401).json({error:'Staff identity required.'});return;}
  next();
});
router.get('/',(req,res)=>{try{res.json({decisions:listDecisions(req.projectId!),identity_mode:process.env.AUTH_MODE??'local'});}catch(e){handleRouteError(e,res);}});
router.post('/preview',requireStaffMutation,(req,res)=>{try{res.json(previewDecision(req.projectId!,req.body?.proposal));}catch(e){handleRouteError(e,res);}});
router.post('/import',requireStaffMutation,(req,res)=>{try{res.json(importDecision(req.projectId!,req.body?.proposal,String(req.body?.content_hash??'')));}catch(e){handleRouteError(e,res);}});
router.post('/:id/reconcile/preview',requireStaffMutation,(req,res)=>{try{res.json(previewDecisionReconciliation(req.projectId!,req.params.id,String(req.body?.content_hash??''),req.body?.proposal));}catch(e){handleRouteError(e,res);}});
router.post('/:id/reconcile/apply',requireStaffMutation,(req,res)=>{try{res.json(applyDecisionReconciliation(req.projectId!,req.params.id,String(req.body?.content_hash??''),String(req.body?.preview_hash??''),req.userName!,String(req.body?.note??''),req.body?.proposal));}catch(e){handleRouteError(e,res);}});
router.post('/:id/sources/preview',requireStaffMutation,(req,res)=>{try{res.json(previewDecisionSources(req.projectId!,req.params.id,req.body?.capture));}catch(e){handleRouteError(e,res);}});
router.post('/:id/sources/apply',requireStaffMutation,(req,res)=>{try{res.json(reviewDecisionSources(req.projectId!,req.params.id,req.body?.capture,String(req.body?.content_hash??''),req.userName!));}catch(e){handleRouteError(e,res);}});
router.post('/:id/actions',requireStaffMutation,(req,res)=>{try{
 const b=req.body??{};
 res.json(actOnDecision(req.projectId!,req.params.id,String(b.content_hash??''),String(b.action??''),req.userName!,String(b.note??''),b.human_confirmed===true,b.amendment));
}catch(e){handleRouteError(e,res);}});
export default router;

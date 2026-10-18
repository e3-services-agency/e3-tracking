import { Router } from 'express';
import { previewProjectPromotion, applyProjectPromotion } from '../services/projectPromotion.service';
import { requireStaffMutation } from '../middleware/staffMutation';
import { handleRouteError } from './routeErrors';
const router = Router({ mergeParams: true });
router.use((req, res, next) => {
    if (process.env.PROJECT_PROMOTION_ENABLED !== 'true') { res.status(404).json({ error: 'Project promotion is not enabled.' }); return; }
    next();
});
router.post('/preview', requireStaffMutation, (req, res) => {
    try { res.json(previewProjectPromotion(req.projectId!, req.body?.input)); } catch (error) { handleRouteError(error, res); }
});
router.post('/apply', requireStaffMutation, (req, res) => {
    try { res.json(applyProjectPromotion(req.projectId!, req.body?.input, String(req.body?.plan_hash ?? ''), String(req.body?.destination_baseline_hash ?? ''), req.userName!, req.body?.human_confirmed === true)); } catch (error) { handleRouteError(error, res); }
});
export default router;

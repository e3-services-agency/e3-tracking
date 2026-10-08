import { Router } from 'express';
import { listQaReports, getQaReport } from '../dal/qa-report.dal';
import { handleRouteError } from './routeErrors';
const router = Router({ mergeParams: true });
router.get('/', (req, res) => { try {
    res.json(listQaReports(req.projectId!));
}
catch (err) {
    handleRouteError(err, res);
} });
router.get('/:id', (req, res) => { try {
    res.json(getQaReport(req.projectId!, req.params.id));
}
catch (err) {
    handleRouteError(err, res);
} });
export default router;

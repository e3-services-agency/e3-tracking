/**
 * Project-scope export routes (D-10, D-18), mounted at `/api/projects/:projectId/export` behind
 * `requireProject`. Journey-scoped export and share-token export are gone; this is project-wide.
 */
import { Router, type Request, type Response } from 'express';
import { generateProjectDocumentationHtml } from '../services/export.service';
import {
  exportDataMapping,
  exportExpirationSettings,
  exportDataManagerCustomers,
} from '../services/bloomreachExport.service';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/documentation.html', async (req: Request, res: Response) => {
  try {
    const html = await generateProjectDocumentationHtml(req.projectId!);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(200).send(html);
  } catch (err) {
    handleRouteError(err, res);
  }
});

// Bloomreach data-mapping / expiration-settings export (T-1-08, D-04): round-trips what the
// project's data-mapping / expiration-settings import produced (see bloomreachExport.service.ts).
router.get('/data-mapping.json', (req: Request, res: Response) => {
  try {
    res.status(200).json(exportDataMapping(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/expiration-settings.json', (req: Request, res: Response) => {
  try {
    res.status(200).json(exportExpirationSettings(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

// Data Manager customers export (T-2-02, D-28): round-trips what the project's Data Manager
// customers import produced (see bloomreachExport.service.ts's exportDataManagerCustomers).
router.get('/data-manager-customers.json', (req: Request, res: Response) => {
  try {
    res.status(200).json(exportDataManagerCustomers(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;

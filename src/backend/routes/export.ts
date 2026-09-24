/**
 * Project-scope export routes (D-10, D-18), mounted at `/api/projects/:projectId/export` behind
 * `requireProject`. Journey-scoped export and share-token export are gone; this is project-wide.
 */
import { Router, type Request, type Response } from 'express';
import { generateProjectDocumentationHtml } from '../services/export.service';
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

export default router;

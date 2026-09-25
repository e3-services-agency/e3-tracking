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
  exportDataManagerEvents,
} from '../services/bloomreachExport.service';
import { buildIdentityCodegen } from '../services/codegen.service';
import { listIdentityRules } from '../dal/identity-rule.dal';
import { listProperties } from '../dal/property.dal';
import { exportQaRunAsCustomerEventsExport } from '../services/qaRunExport.service';
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

// Identity codegen (D-38): identify/update/anonymize snippets built from this project's identity
// rules and mapped customer properties; the same payload as
// `GET /identity-rules/codegen` (`routes/identity-rules.ts`), exposed here too so the
// documentation export and any project-wide export tooling do not need the identity-rules router.
router.get('/codegen/identity', (req: Request, res: Response) => {
  try {
    const rules = listIdentityRules(req.projectId!);
    const customerProperties = listProperties(req.projectId!, { scope: 'customer' });
    res.status(200).json(buildIdentityCodegen(rules, customerProperties));
  } catch (err) {
    handleRouteError(err, res);
  }
});

// QA run export (T-2-11, PLAN "QA run export"): re-emits a run's observations in the Bloomreach
// customer-events-export.json shape.
router.get('/qa-runs/:runId/customer-events-export.json', (req: Request, res: Response) => {
  try {
    res.status(200).json(exportQaRunAsCustomerEventsExport(req.projectId!, req.params.runId));
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

// Data Manager events export (T-2-03, D-28, D-35): round-trips what the project's Data Manager
// events import produced, plus passthrough of deselected sdk/platform (or never-selected) events
// from the stored snapshot. `?passthrough=false` returns only the live app definition (D-35's
// documented alternative), defaulting to `true` so the bridge gets the whole file back.
router.get('/data-manager-events.json', (req: Request, res: Response) => {
  try {
    const passthrough = req.query.passthrough !== 'false';
    res.status(200).json(exportDataManagerEvents(req.projectId!, { passthrough }));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;

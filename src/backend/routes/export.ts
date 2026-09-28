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
import { getProjectOrThrow } from '../dal/project.dal';
import { exportQaRunAsCustomerEventsExport } from '../services/qaRunExport.service';
import { buildTrackingDocument } from '../services/document.service';
import { TRACKING_DOCUMENT_VERSION } from '../../domain/document/trackingDocument';
import { isCsvEntity } from '../../domain/csv';
import { listCsvEntityCounts, buildCsvFile } from '../services/csvExport.service';
import { buildBackup } from '../services/backup.service';
import { BadRequestError } from '../errors';
import { handleRouteError } from './routeErrors';

/** `yyyymmdd`, used by the CSV export filename (D-46). */
function todayCompact(): string {
  return new Date().toISOString().slice(0, 10).replace(/-/g, '');
}

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

// Tracking document (D-34, T-2-08): machine-readable, per-project export of definitions, rules,
// use cases, identity codegen and a findings summary. `?version=` requests an older document
// version (D-34's "kept servable for one phase behind current"); only version 1 exists so far, so
// any other value is a 400.
router.get('/tracking-document.json', (req: Request, res: Response) => {
  try {
    const requestedVersion = req.query.version !== undefined ? Number(req.query.version) : TRACKING_DOCUMENT_VERSION;
    if (!Number.isInteger(requestedVersion) || requestedVersion !== TRACKING_DOCUMENT_VERSION) {
      throw new BadRequestError(
        `Unsupported tracking document version "${String(req.query.version)}"; only version ${TRACKING_DOCUMENT_VERSION} is available.`,
        'version'
      );
    }
    res.status(200).json(buildTrackingDocument(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

// CSV export per entity (D-46, T-3-03, capability 9, qa-roundtrip scenario 6). Listing route first
// so `/csv/:entity` below never shadows it.
router.get('/csv', (req: Request, res: Response) => {
  try {
    res.status(200).json({ entities: listCsvEntityCounts(req.projectId!) });
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/csv/:entity', (req: Request, res: Response) => {
  try {
    const entity = req.params.entity;
    if (!isCsvEntity(entity)) {
      res.status(404).json({ error: `Unknown CSV entity "${entity}".`, code: 'UNKNOWN_CSV_ENTITY' });
      return;
    }
    const project = getProjectOrThrow(req.projectId!);
    const csv = buildCsvFile(req.projectId!, entity);
    const filename = `${project.key}-${entity}-${todayCompact()}.csv`;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(csv);
  } catch (err) {
    handleRouteError(err, res);
  }
});

// Full JSON backup export (D-45, T-3-04, capability 1): one self-contained file, embedded files as
// base64, per the contract in `backup.service.ts`. Restore (T-3-05) is a separate task.
router.get('/backup.json', async (req: Request, res: Response) => {
  try {
    const project = getProjectOrThrow(req.projectId!);
    const backup = await buildBackup(req.projectId!);
    const filename = `${project.key}-backup-${todayCompact()}.json`;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).json(backup);
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;

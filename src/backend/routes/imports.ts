/**
 * Bloomreach import routes (T-1-08, D-04, D-22), mounted at `/api/projects/:projectId/import`.
 * `preview` takes the raw Bloomreach JSON as the whole request body and returns `{items,
 * warnings, payload_hash}`. `apply` takes `{payload, payload_hash, selected_item_ids}`: it re-runs
 * preview against the resent `payload`, 409s `PAYLOAD_CHANGED` (via `PayloadChangedError`) when
 * the hash no longer matches, and otherwise applies the selected items in one transaction.
 */
import { Router, type Request, type Response } from 'express';
import { previewDataMapping, applyDataMapping } from '../services/dataMappingImport.service';
import { previewExpirationSettings, applyExpirationSettings } from '../services/expirationSettingsImport.service';
import {
  previewCustomerEventsExport,
  applyCustomerEventsExport,
} from '../services/customerEventsExportImport.service';
import {
  previewDataManagerCustomers,
  applyDataManagerCustomers,
} from '../services/dataManagerCustomersImport.service';
import { previewDataManagerEvents, applyDataManagerEvents } from '../services/dataManagerEventsImport.service';
import multer from 'multer';
import { previewQaSample, applyQaSample, readQaSampleArchive } from '../services/qaSampleImport.service';
import { BadRequestError, ValidationError } from '../errors';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

interface ApplyBody {
  payload: unknown;
  payload_hash: string;
  selected_item_ids: string[];
}

function parseApplyBody(req: Request): ApplyBody {
  const body = (req.body ?? {}) as Record<string, unknown>;
  return {
    payload: body.payload,
    payload_hash: typeof body.payload_hash === 'string' ? body.payload_hash : '',
    selected_item_ids: Array.isArray(body.selected_item_ids) ? (body.selected_item_ids as string[]) : [],
  };
}

router.post('/data-mapping/preview', (req: Request, res: Response) => {
  try {
    res.status(200).json(previewDataMapping(req.projectId!, req.body));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/data-mapping/apply', (req: Request, res: Response) => {
  try {
    const { payload, payload_hash, selected_item_ids } = parseApplyBody(req);
    res.status(200).json(applyDataMapping(req.projectId!, payload, payload_hash, selected_item_ids));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/expiration-settings/preview', (req: Request, res: Response) => {
  try {
    res.status(200).json(previewExpirationSettings(req.projectId!, req.body));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/expiration-settings/apply', (req: Request, res: Response) => {
  try {
    const { payload, payload_hash, selected_item_ids } = parseApplyBody(req);
    res.status(200).json(applyExpirationSettings(req.projectId!, payload, payload_hash, selected_item_ids));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/customer-events-export/preview', (req: Request, res: Response) => {
  try {
    res.status(200).json(previewCustomerEventsExport(req.projectId!, req.body));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/customer-events-export/apply', (req: Request, res: Response) => {
  try {
    const { payload, payload_hash, selected_item_ids } = parseApplyBody(req);
    res
      .status(200)
      .json(
        applyCustomerEventsExport(req.projectId!, payload, payload_hash, selected_item_ids, req.userName ?? null)
      );
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/data-manager-customers/preview', (req: Request, res: Response) => {
  try {
    res.status(200).json(previewDataManagerCustomers(req.projectId!, req.body));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/data-manager-customers/apply', (req: Request, res: Response) => {
  try {
    const { payload, payload_hash, selected_item_ids } = parseApplyBody(req);
    res.status(200).json(applyDataManagerCustomers(req.projectId!, payload, payload_hash, selected_item_ids));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/data-manager-events/preview', (req: Request, res: Response) => {
  try {
    res.status(200).json(previewDataManagerEvents(req.projectId!, req.body));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/data-manager-events/apply', (req: Request, res: Response) => {
  try {
    const { payload, payload_hash, selected_item_ids } = parseApplyBody(req);
    res.status(200).json(applyDataManagerEvents(req.projectId!, payload, payload_hash, selected_item_ids));
  } catch (err) {
    handleRouteError(err, res);
  }
});

// T-5-30: QA sample archive (zip from the extension), multipart field `file`.
const archiveUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024, files: 1 } }).single('file');
function uploadArchive(req: Request, res: Response, next: (e?: unknown) => void): void {
  archiveUpload(req, res, (err: unknown) => {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      res.status(400).json({ error: err.message, code: 'UPLOAD_ERROR', field: 'file' });
      return;
    }
    next(err);
  });
}

router.post('/qa-sample/preview', uploadArchive, async (req: Request, res: Response) => {
  try {
    if (!req.file) throw new BadRequestError('file is required (multipart field "file").', 'file');
    res.status(200).json(previewQaSample(req.projectId!, await readQaSampleArchive(req.file.buffer)));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.post('/qa-sample/apply', uploadArchive, async (req: Request, res: Response) => {
  try {
    if (!req.file) throw new BadRequestError('file is required (multipart field "file").', 'file');
    const body = (req.body ?? {}) as Record<string, unknown>;
    const hash = typeof body.payload_hash === 'string' ? body.payload_hash : '';
    let parsed: unknown = [];
    if (typeof body.selected_item_ids === 'string') {
      try {
        parsed = JSON.parse(body.selected_item_ids);
      } catch {
        throw new ValidationError('selected_item_ids must be a JSON array of strings.', 'selected_item_ids');
      }
    } else if (body.selected_item_ids !== undefined) {
      parsed = body.selected_item_ids;
    }
    if (!Array.isArray(parsed) || !parsed.every((x) => typeof x === 'string')) {
      throw new ValidationError('selected_item_ids must be a JSON array of strings.', 'selected_item_ids');
    }
    const ids = parsed as string[];
    const force = body.force === 'true' || body.force === true;
    const docs = await readQaSampleArchive(req.file.buffer);
    res.status(200).json(applyQaSample(req.projectId!, docs, hash, ids, req.userName ?? null, force));
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;

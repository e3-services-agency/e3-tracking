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

export default router;

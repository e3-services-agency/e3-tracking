/**
 * StandardEventMapping routes, mounted at `/api/projects/:projectId/standard-event-mappings`
 * (T-1-05). `standardEvent` is the free-string key (D-26), taken from the URL segment, not an id.
 */
import { Router, type Request, type Response } from 'express';
import * as StandardEventMappingDAL from '../dal/standard-event-mapping.dal';
import { handleRouteError } from './routeErrors';

const router = Router({ mergeParams: true });

router.get('/', (req: Request, res: Response) => {
  try {
    res.status(200).json(StandardEventMappingDAL.listStandardEventMappings(req.projectId!));
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.get('/:standardEvent', (req: Request, res: Response) => {
  const row = StandardEventMappingDAL.getStandardEventMappingByKey(req.projectId!, req.params.standardEvent);
  if (!row) {
    res.status(404).json({ error: 'Standard event mapping not found.', code: 'NOT_FOUND', resource: 'standard_event_mapping' });
    return;
  }
  res.status(200).json(row);
});

router.put('/:standardEvent', (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const eventId = typeof body.event_id === 'string' ? body.event_id : '';
  if (!eventId) {
    res.status(400).json({ error: 'event_id is required.', code: 'EVENT_ID_REQUIRED', field: 'event_id' });
    return;
  }
  try {
    const row = StandardEventMappingDAL.upsertStandardEventMapping(req.projectId!, req.params.standardEvent, {
      event_id: eventId,
      variant_id: 'variant_id' in body ? (body.variant_id as string | null) : null,
      field_map_json: 'field_map_json' in body ? (body.field_map_json as Record<string, string | null>) : null,
    });
    res.status(200).json(row);
  } catch (err) {
    handleRouteError(err, res);
  }
});

router.delete('/:standardEvent', (req: Request, res: Response) => {
  try {
    StandardEventMappingDAL.deleteStandardEventMapping(req.projectId!, req.params.standardEvent);
    res.status(204).end();
  } catch (err) {
    handleRouteError(err, res);
  }
});

export default router;

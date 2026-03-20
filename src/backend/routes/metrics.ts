import { Router, type Request, type Response } from 'express';
import { requireWorkspace } from '../middleware/workspace';
import * as MetricService from '../services/metric.service';
import { DatabaseError, NotFoundError } from '../errors';
import {
  METRIC_AGGREGATION_TYPES,
  type CreateMetricInput,
  type MetricAggregationType,
} from '../../types/schema';

const router = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseAggregationType(
  value: unknown
): MetricAggregationType | undefined {
  return typeof value === 'string' &&
    METRIC_AGGREGATION_TYPES.includes(value as MetricAggregationType)
    ? (value as MetricAggregationType)
    : undefined;
}

function parseFilterJson(
  value: unknown
): { value?: Record<string, unknown> | null; error?: string } {
  if (value === undefined) return {};
  if (value === null) return { value: null };
  if (!isRecord(value)) {
    return { error: 'filter_json must be an object when provided.' };
  }

  return { value };
}

router.get('/', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }

  try {
    const metrics = await MetricService.listMetrics(workspaceId);
    res.status(200).json(metrics);
  } catch (err) {
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to list metrics.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

router.get('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }

  try {
    const metric = await MetricService.getMetricById(workspaceId, req.params.id);
    if (!metric) {
      res.status(404).json({ error: 'Metric not found.', code: 'NOT_FOUND' });
      return;
    }
    res.status(200).json(metric);
  } catch (err) {
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to fetch metric.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

router.post('/', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const aggregationType = parseAggregationType(body.aggregation_type);
  const primaryEventId =
    typeof body.primary_event_id === 'string' ? body.primary_event_id.trim() : '';
  const parsedFilter = parseFilterJson(body.filter_json);

  if (!name) {
    res.status(400).json({ error: 'Metric name is required.', code: 'NAME_REQUIRED' });
    return;
  }
  if (!aggregationType) {
    res.status(400).json({
      error: `aggregation_type must be one of: ${METRIC_AGGREGATION_TYPES.join(', ')}.`,
      code: 'AGGREGATION_TYPE_INVALID',
    });
    return;
  }
  if (!primaryEventId) {
    res.status(400).json({
      error: 'primary_event_id is required.',
      code: 'PRIMARY_EVENT_REQUIRED',
    });
    return;
  }
  if (parsedFilter.error) {
    res.status(400).json({
      error: parsedFilter.error,
      code: 'FILTER_INVALID',
    });
    return;
  }

  const input: CreateMetricInput = {
    name,
    description: typeof body.description === 'string' ? body.description : undefined,
    owner_team_id: typeof body.owner_team_id === 'string' ? body.owner_team_id : undefined,
    aggregation_type: aggregationType,
    primary_event_id: primaryEventId,
    measurement_property_id:
      typeof body.measurement_property_id === 'string'
        ? body.measurement_property_id
        : null,
    filter_json: parsedFilter.value,
  };

  try {
    const metric = await MetricService.createMetric(workspaceId, input);
    res.status(201).json(metric);
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to create metric.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

router.patch('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }

  const body = req.body as Record<string, unknown>;
  const parsedFilter = parseFilterJson(body.filter_json);
  if (body.aggregation_type !== undefined && !parseAggregationType(body.aggregation_type)) {
    res.status(400).json({
      error: `aggregation_type must be one of: ${METRIC_AGGREGATION_TYPES.join(', ')}.`,
      code: 'AGGREGATION_TYPE_INVALID',
    });
    return;
  }
  if (parsedFilter.error) {
    res.status(400).json({
      error: parsedFilter.error,
      code: 'FILTER_INVALID',
    });
    return;
  }

  const input: Partial<CreateMetricInput> = {
    name: typeof body.name === 'string' ? body.name : undefined,
    description:
      body.description !== undefined
        ? (typeof body.description === 'string' ? body.description : null)
        : undefined,
    owner_team_id:
      body.owner_team_id !== undefined
        ? (typeof body.owner_team_id === 'string' ? body.owner_team_id : null)
        : undefined,
    aggregation_type:
      body.aggregation_type !== undefined
        ? parseAggregationType(body.aggregation_type)
        : undefined,
    primary_event_id:
      body.primary_event_id !== undefined && typeof body.primary_event_id === 'string'
        ? body.primary_event_id
        : undefined,
    measurement_property_id:
      body.measurement_property_id !== undefined
        ? (typeof body.measurement_property_id === 'string' ? body.measurement_property_id : null)
        : undefined,
    filter_json: parsedFilter.value,
  };

  try {
    const metric = await MetricService.updateMetric(workspaceId, req.params.id, input);
    res.status(200).json(metric);
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to update metric.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

router.delete('/:id', requireWorkspace, async (req: Request, res: Response): Promise<void> => {
  const workspaceId = req.workspaceId;
  if (!workspaceId) {
    res.status(403).json({ error: 'Workspace context required.', code: 'WORKSPACE_REQUIRED' });
    return;
  }

  try {
    await MetricService.deleteMetric(workspaceId, req.params.id);
    res.status(204).send();
  } catch (err) {
    if (err instanceof NotFoundError) {
      res.status(404).json({ error: err.message, code: err.code });
      return;
    }
    if (err instanceof DatabaseError) {
      res.status(500).json({ error: 'Failed to delete metric.', code: err.code });
      return;
    }
    res.status(500).json({ error: 'An unexpected error occurred.', code: 'INTERNAL_ERROR' });
  }
});

export default router;

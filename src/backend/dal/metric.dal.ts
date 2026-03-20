import { getSupabaseOrThrow } from '../db/supabase';
import type {
  CreateMetricInput,
  MetricAggregationType,
  MetricRow,
} from '../../types/schema';
import { METRIC_AGGREGATION_TYPES } from '../../types/schema';
import { DatabaseError, NotFoundError } from '../errors';
import { getEventById, getPropertyById } from './event.dal';

type MetricDbRow = Omit<MetricRow, 'aggregation_type'> & {
  aggregation_type: MetricAggregationType;
};

function mapMetricRow(row: MetricDbRow | null): MetricRow | null {
  if (row === null) return null;

  return {
    id: row.id,
    workspace_id: row.workspace_id,
    name: row.name,
    description: row.description,
    owner_team_id: row.owner_team_id ?? null,
    aggregation_type: row.aggregation_type,
    primary_event_id: row.primary_event_id,
    measurement_property_id: row.measurement_property_id ?? null,
    filter_json:
      row.filter_json && typeof row.filter_json === 'object' && !Array.isArray(row.filter_json)
        ? (row.filter_json as Record<string, unknown>)
        : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
  };
}

async function validateMetricReferences(
  workspaceId: string,
  input: {
    primary_event_id?: string | null;
    measurement_property_id?: string | null;
  }
): Promise<void> {
  if (input.primary_event_id !== undefined && input.primary_event_id !== null) {
    const event = await getEventById(workspaceId, input.primary_event_id);
    if (!event) {
      throw new NotFoundError('Primary event not found in this workspace.', 'event');
    }
  }

  if (input.measurement_property_id !== undefined && input.measurement_property_id !== null) {
    const property = await getPropertyById(workspaceId, input.measurement_property_id);
    if (!property) {
      throw new NotFoundError(
        'Measurement property not found in this workspace.',
        'property'
      );
    }
  }
}

function normalizeAggregationType(value: MetricAggregationType): MetricAggregationType {
  return METRIC_AGGREGATION_TYPES.includes(value) ? value : 'count';
}

export async function listMetrics(workspaceId: string): Promise<MetricRow[]> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('metrics')
    .select('*')
    .eq('workspace_id', workspaceId)
    .is('deleted_at', null)
    .order('name');

  if (error) {
    throw new DatabaseError(`Failed to list metrics: ${error.message}`, error);
  }

  return (data ?? []).map((row) => mapMetricRow(row as MetricDbRow)!).filter(Boolean);
}

export async function getMetricById(
  workspaceId: string,
  metricId: string
): Promise<MetricRow | null> {
  const supabase = getSupabaseOrThrow();
  const { data, error } = await supabase
    .from('metrics')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('id', metricId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    throw new DatabaseError(`Failed to fetch metric: ${error.message}`, error);
  }

  return mapMetricRow(data as MetricDbRow | null);
}

export async function createMetric(
  workspaceId: string,
  input: CreateMetricInput
): Promise<MetricRow> {
  await validateMetricReferences(workspaceId, {
    primary_event_id: input.primary_event_id,
    measurement_property_id: input.measurement_property_id ?? null,
  });

  const supabase = getSupabaseOrThrow();
  const row = {
    workspace_id: workspaceId,
    name: input.name.trim(),
    description: input.description?.trim() ?? null,
    owner_team_id: input.owner_team_id?.trim() || null,
    aggregation_type: normalizeAggregationType(input.aggregation_type),
    primary_event_id: input.primary_event_id,
    measurement_property_id: input.measurement_property_id?.trim() || null,
    filter_json: input.filter_json ?? null,
    deleted_at: null,
  };

  const { data, error } = await supabase
    .from('metrics')
    .insert(row)
    .select()
    .single();

  if (error) {
    throw new DatabaseError(`Failed to create metric: ${error.message}`, error);
  }
  if (!data) {
    throw new DatabaseError('Create metric returned no row.');
  }

  return mapMetricRow(data as MetricDbRow)!;
}

export async function updateMetric(
  workspaceId: string,
  metricId: string,
  input: Partial<CreateMetricInput>
): Promise<MetricRow> {
  const existing = await getMetricById(workspaceId, metricId);
  if (!existing) {
    throw new NotFoundError('Metric not found.', 'metric');
  }

  await validateMetricReferences(workspaceId, {
    primary_event_id: input.primary_event_id,
    measurement_property_id:
      input.measurement_property_id === undefined
        ? undefined
        : (input.measurement_property_id ?? null),
  });

  const supabase = getSupabaseOrThrow();
  const updates: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (input.name !== undefined) updates.name = input.name.trim();
  if (input.description !== undefined) updates.description = input.description?.trim() ?? null;
  if (input.owner_team_id !== undefined) updates.owner_team_id = input.owner_team_id?.trim() || null;
  if (input.aggregation_type !== undefined) {
    updates.aggregation_type = normalizeAggregationType(input.aggregation_type);
  }
  if (input.primary_event_id !== undefined) updates.primary_event_id = input.primary_event_id;
  if (input.measurement_property_id !== undefined) {
    updates.measurement_property_id = input.measurement_property_id?.trim() || null;
  }
  if (input.filter_json !== undefined) updates.filter_json = input.filter_json ?? null;

  const { data, error } = await supabase
    .from('metrics')
    .update(updates)
    .eq('workspace_id', workspaceId)
    .eq('id', metricId)
    .is('deleted_at', null)
    .select()
    .single();

  if (error) {
    throw new DatabaseError(`Failed to update metric: ${error.message}`, error);
  }
  if (!data) {
    throw new NotFoundError('Metric not found after update.', 'metric');
  }

  return mapMetricRow(data as MetricDbRow)!;
}

export async function deleteMetric(
  workspaceId: string,
  metricId: string
): Promise<void> {
  const existing = await getMetricById(workspaceId, metricId);
  if (!existing) {
    throw new NotFoundError('Metric not found.', 'metric');
  }

  const now = new Date().toISOString();
  const supabase = getSupabaseOrThrow();
  const { error } = await supabase
    .from('metrics')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .eq('workspace_id', workspaceId)
    .eq('id', metricId)
    .is('deleted_at', null);

  if (error) {
    throw new DatabaseError(`Failed to delete metric: ${error.message}`, error);
  }
}

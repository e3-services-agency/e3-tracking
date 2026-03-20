import * as MetricDAL from '../dal/metric.dal';
import type { CreateMetricInput, MetricRow } from '../../types/schema';

export async function listMetrics(workspaceId: string): Promise<MetricRow[]> {
  return MetricDAL.listMetrics(workspaceId);
}

export async function getMetricById(
  workspaceId: string,
  metricId: string
): Promise<MetricRow | null> {
  return MetricDAL.getMetricById(workspaceId, metricId);
}

export async function createMetric(
  workspaceId: string,
  input: CreateMetricInput
): Promise<MetricRow> {
  return MetricDAL.createMetric(workspaceId, input);
}

export async function updateMetric(
  workspaceId: string,
  metricId: string,
  input: Partial<CreateMetricInput>
): Promise<MetricRow> {
  return MetricDAL.updateMetric(workspaceId, metricId, input);
}

export async function deleteMetric(
  workspaceId: string,
  metricId: string
): Promise<void> {
  return MetricDAL.deleteMetric(workspaceId, metricId);
}

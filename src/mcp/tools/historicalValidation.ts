import { resolveProject } from '../resolve';
import { previewHistoricalValidation, applyHistoricalValidation, getHistoricalValidation } from '../../backend/services/historicalValidation.service';
import { ValidationError } from '../../backend/errors';
import { conditionalRead, projectRevision, publicHash, type ConditionalInput } from '../readOptions';
export async function previewHistoricalFileValidation(input: { project_key?: string; manifest: unknown }) {
  return previewHistoricalValidation(resolveProject(input.project_key).id, input.manifest);
}
export async function applyHistoricalFileValidation(input: { project_key?: string; manifest: unknown; payload_hash: string; confirmed: boolean }) {
  if (!input.confirmed) throw new ValidationError('Confirm the concrete preview before applying.');
  return applyHistoricalValidation(resolveProject(input.project_key).id, input.manifest, input.payload_hash);
}
export async function getHistoricalFileValidation(input: ConditionalInput & { project_key?: string; report_id: string; offset?: number; limit?: number }) {
  const projectId = resolveProject(input.project_key).id;
  for (let attempt = 0; attempt < 3; attempt++) {
  const generation = projectRevision(projectId);
  const body = await getHistoricalValidation(projectId, input.report_id, input.offset, input.limit);
  if (generation !== projectRevision(projectId)) continue;
  // Hash the exact page and live source availability, not just the immutable identity_hash.
  // A missing source or a renamed/deleted linked event must invalidate a cached response too.
  const next = body.offset + body.checks.length;
  const { checks: _checks, offset: _offset, limit: _limit, ...metadata } = body;
  return conditionalRead(body.id, { ...body, total: body.checks_total, returned: body.checks.length, result_marker: publicHash({ generation, ...metadata }), next_offset: next < body.checks_total ? next : null, truncated: next < body.checks_total }, input);
  }
  throw new ValidationError('Report changed during the read; retry the traversal.');
}

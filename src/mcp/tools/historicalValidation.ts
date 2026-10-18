import { resolveProject } from '../resolve';
import { previewHistoricalValidation, applyHistoricalValidation, getHistoricalValidation } from '../../backend/services/historicalValidation.service';
import { ValidationError } from '../../backend/errors';
export async function previewHistoricalFileValidation(input: { project_key?: string; manifest: unknown }) {
  return previewHistoricalValidation(resolveProject(input.project_key).id, input.manifest);
}
export async function applyHistoricalFileValidation(input: { project_key?: string; manifest: unknown; payload_hash: string; confirmed: boolean }) {
  if (!input.confirmed) throw new ValidationError('Confirm the concrete preview before applying.');
  return applyHistoricalValidation(resolveProject(input.project_key).id, input.manifest, input.payload_hash);
}
export async function getHistoricalFileValidation(input: { project_key?: string; report_id: string; offset?: number; limit?: number }) {
  return getHistoricalValidation(resolveProject(input.project_key).id, input.report_id, input.offset, input.limit);
}

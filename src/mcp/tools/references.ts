import { z } from 'zod';
import { getDb } from '../../backend/db';
import { newId, nowIso } from '../../backend/db/util';
import { getActor } from '../../backend/context/actor';
import * as Findings from '../../backend/dal/finding.dal';
import * as UseCases from '../../backend/dal/use-case.dal';
import { resolveProject } from '../resolve';
import { durableStep } from '../idempotency';
import { McpToolError } from '../errors';

const scope = z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/);
export const referenceShape = {
  target_kind: z.enum(['finding', 'use_case']), target_id: z.string().uuid(),
  reference: z.strictObject({ system: z.literal('cortex'), client: scope, project: scope, record_type: z.enum(['entity','document','decision']),
    record_id: z.string().regex(/^[a-f0-9]{24}$/), revision: z.number().int().positive(), content_hash: z.string().regex(/^[a-f0-9]{64}$/), note: z.string().max(1000).optional() }),
  dry_run: z.boolean().optional(),
};
export function referencesFor(projectId: string, kind: 'finding' | 'use_case', targetId?: string): Record<string, unknown>[] {
  return getDb().prepare(`SELECT id,target_id,system,client,project,record_type,record_id,revision,content_hash,note,actor,agent,created_at FROM external_references WHERE project_id=? AND target_kind=? ${targetId ? 'AND target_id=?' : ''} ORDER BY created_at,id`).all(projectId, kind, ...(targetId ? [targetId] : [])) as Record<string, unknown>[];
}
export async function addReference(input: z.infer<z.ZodObject<typeof referenceShape>> & { project_key?: string }) {
  const project = resolveProject(input.project_key);
  return durableStep('mutation', () => {
    const valid = z.object(referenceShape).safeParse(input);
    if (!valid.success) throw new McpToolError('VALIDATION_ERROR', 'Invalid scoped reference. Check the tool schema.');
    const parsed = valid.data;
    if (parsed.target_kind === 'finding') Findings.getFindingOrThrow(project.id, parsed.target_id);
    else UseCases.getUseCaseOrThrow(project.id, parsed.target_id);
    const ref = parsed.reference;
    const existing = referencesFor(project.id, parsed.target_kind, parsed.target_id).find(r => r.system === ref.system && r.client === ref.client && r.project === ref.project && r.record_type === ref.record_type && r.record_id === ref.record_id && r.revision === ref.revision);
    if (existing && (existing.content_hash !== ref.content_hash || (existing.note ?? null) !== (ref.note ?? null))) throw new McpToolError('REFERENCE_CONFLICT', 'This pinned reference already exists with different metadata.');
    if (existing) return { dry_run: parsed.dry_run !== false, action: 'unchanged', reference: existing, validation: 'pointer_only_not_verified' };
    const row = { id: newId(), project_id: project.id, target_kind: parsed.target_kind, target_id: parsed.target_id, ...ref, note: ref.note ?? null, actor: getActor().actor, agent: getActor().agent ?? null, created_at: nowIso() };
    if (parsed.dry_run === false) getDb().prepare('INSERT INTO external_references(id,project_id,target_kind,target_id,system,client,project,record_type,record_id,revision,content_hash,note,actor,agent,created_at) VALUES(@id,@project_id,@target_kind,@target_id,@system,@client,@project,@record_type,@record_id,@revision,@content_hash,@note,@actor,@agent,@created_at)').run(row);
    const { project_id: _projectId, ...publicRow } = row;
    return { dry_run: parsed.dry_run !== false, action: 'create', reference: publicRow, validation: 'pointer_only_not_verified' };
  });
}

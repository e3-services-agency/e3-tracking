import { AsyncLocalStorage } from 'node:async_hooks';
import { getDb } from '../backend/db';
import { newId, nowIso } from '../backend/db/util';
import { currentHttpRights } from './httpContext';
import * as OAuth from '../backend/dal/mcp-oauth.dal';
import { resolveProject } from './resolve';
import { publicHash } from './readOptions';
import { McpToolError } from './errors';

const LEASE_MS = 60_000;
interface RequestRow { id: string; args_hash: string; batch_id: string; state: string; lease_owner: string; lease_until: number; response_json: string | null; error_json: string | null }
const active = new AsyncLocalStorage<RequestRow>();
export const currentWriteRequest = () => active.getStore();
export function recoveredStep<T>(step: string): T | undefined {
  const request = active.getStore();
  if (!request) return undefined;
  const row = getDb().prepare('SELECT result_json FROM mcp_write_steps WHERE request_id=? AND step=?').get(request.id, step) as { result_json: string } | undefined;
  return row ? JSON.parse(row.result_json) as T : undefined;
}

function identity(tool: string, input: Record<string, unknown>, projectId: string) {
  const rights = currentHttpRights();
  const auth = rights ? OAuth.access(rights.token, rights.resource) : undefined;
  const { idempotency_key: key, project_key: _project, actor: _actor, ...args } = input;
  if (typeof key !== 'string' || !key.trim() || key.length > 200) throw new McpToolError('VALIDATION_ERROR', 'idempotency_key must contain 1 to 200 characters.');
  return { projectId, principal: auth?.grant.owner ?? 'local_unverified', client: auth?.grant.client_id ?? 'stdio', tool, keyHash: publicHash(key), argsHash: publicHash(args) };
}

/** Allows replay after a target was deleted, only after current scope/project authorization. */
export function knownWriteRequest(tool: string, input: Record<string, unknown>, projectId: string): boolean {
  if (typeof input.idempotency_key !== 'string' || !input.idempotency_key.trim() || input.idempotency_key.length > 200) return false;
  const i = identity(tool, input, projectId);
  const row = getDb().prepare('SELECT args_hash FROM mcp_write_requests WHERE project_id=? AND principal=? AND client_id=? AND tool=? AND key_hash=?').get(i.projectId, i.principal, i.client, i.tool, i.keyHash) as { args_hash: string } | undefined;
  // Schema parsing can trim/default fields. The exact fingerprint is checked after that,
  // before any handler executes; only a previously bound principal/client/project/tool key
  // may bypass current target-existence checks (necessary to replay successful deletes).
  return !!row;
}

/** A mutation and its durable result commit together. Never hold a SQLite transaction over await. */
export function durableStep<T>(step: string, fn: () => T): T {
  currentHttpRights();
  const request = active.getStore();
  if (!request) return fn();
  return getDb().transaction(() => {
    currentHttpRights();
    const row = getDb().prepare('SELECT * FROM mcp_write_requests WHERE id=?').get(request.id) as RequestRow;
    if (row.state !== 'running' || row.lease_owner !== request.lease_owner) throw new McpToolError('IDEMPOTENCY_IN_PROGRESS', 'Another retry owns this request; retry the same key later.');
    const existing = getDb().prepare('SELECT result_json FROM mcp_write_steps WHERE request_id=? AND step=?').get(request.id, step) as { result_json: string } | undefined;
    if (existing) return JSON.parse(existing.result_json) as T;
    const result = fn();
    if (result && typeof (result as any).then === 'function') throw new Error('Durable mutations must be synchronous.');
    getDb().prepare('INSERT INTO mcp_write_steps VALUES(?,?,?)').run(request.id, step, JSON.stringify(result ?? null));
    getDb().prepare('UPDATE mcp_write_requests SET lease_until=? WHERE id=?').run(Date.now() + LEASE_MS, request.id);
    return result;
  }).immediate();
}

export async function withIdempotency(tool: string, input: Record<string, unknown>, fn: () => Promise<unknown>): Promise<unknown> {
  if (input.idempotency_key === undefined) return fn();
  const project = resolveProject(input.project_key as string | undefined);
  const i = identity(tool, input, project.id), leaseOwner = newId();
  const request = getDb().transaction(() => {
    const row = getDb().prepare('SELECT * FROM mcp_write_requests WHERE project_id=? AND principal=? AND client_id=? AND tool=? AND key_hash=?').get(i.projectId, i.principal, i.client, i.tool, i.keyHash) as RequestRow | undefined;
    if (row) {
      if (row.args_hash !== i.argsHash) throw new McpToolError('IDEMPOTENCY_CONFLICT', 'This key was already used with different arguments.');
      if (row.state !== 'running') return row;
      if (row.lease_until > Date.now()) throw new McpToolError('IDEMPOTENCY_IN_PROGRESS', 'Request is still executing; retry the same key later.');
      getDb().prepare('UPDATE mcp_write_requests SET lease_owner=?,lease_until=? WHERE id=?').run(leaseOwner, Date.now() + LEASE_MS, row.id);
      return { ...row, lease_owner: leaseOwner };
    }
    const id = newId(), batchId = newId();
    getDb().prepare('INSERT INTO mcp_write_requests(id,project_id,principal,client_id,tool,key_hash,args_hash,batch_id,state,lease_owner,lease_until,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id, i.projectId, i.principal, i.client, i.tool, i.keyHash, i.argsHash, batchId, 'running', leaseOwner, Date.now() + LEASE_MS, nowIso());
    return getDb().prepare('SELECT * FROM mcp_write_requests WHERE id=?').get(id) as RequestRow;
  }).immediate();
  if (request.state === 'complete') return JSON.parse(request.response_json!);
  if (request.state === 'failed') { const error = JSON.parse(request.error_json!); throw Object.assign(new McpToolError(error.code, error.message), error.details === undefined ? {} : { details: error.details }); }
  try {
    const result = await active.run(request, fn);
    const value = result && typeof result === 'object' ? { ...result, receipt_id: request.id } : result;
    const saved = getDb().prepare("UPDATE mcp_write_requests SET state='complete',response_json=? WHERE id=? AND lease_owner=? AND state='running'").run(JSON.stringify(value), request.id, request.lease_owner);
    if (!saved.changes) throw new McpToolError('IDEMPOTENCY_IN_PROGRESS', 'Another retry owns this request.');
    return value;
  } catch (error) {
    const safe = { code: (error as any)?.code ?? 'INTERNAL_ERROR', message: (error as any)?.code ? (error as Error).message : 'Request failed.', details: (error as any)?.details };
    getDb().prepare("UPDATE mcp_write_requests SET state='failed',error_json=? WHERE id=? AND lease_owner=? AND state='running'").run(JSON.stringify(safe), request.id, request.lease_owner);
    throw error;
  }
}

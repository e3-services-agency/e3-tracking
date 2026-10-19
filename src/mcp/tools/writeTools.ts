/**
 * The write-tool handlers (T-5-01) and `batch_apply`. `registerTools.ts` wires these to the MCP
 * server; tests call the handlers directly (wrapped in `runWithActor` like the registration does).
 *
 * `batch_apply` (D-44): operations run in order inside one `runWithImportBatch`, so every change_log
 * row shares a `batch_id`; it stops at the first error. Applying is not atomic (earlier operations
 * stay written, as with the import apply paths); a dry run executes the whole list inside one
 * rolled-back transaction so later operations see earlier ones (e.g. link after create).
 */
import { z } from 'zod';
import { runWithImportBatch } from '../../backend/context/actor';
import { resolveProject } from '../resolve';
import { McpToolError } from '../errors';
import { createEventTool, updateEventTool, setEventIdentifiersTool } from './writeEvents';
import { createPropertyTool, updatePropertyTool, linkEventPropertyTool, unlinkEventPropertyTool } from './writeProperties';
import { createIdentityRuleTool, createCatalogFieldTool } from './writeIdentityCatalogs';
import { executeOp, parseArgs, runWriteTool, withRollback, writeCommonShape } from './writeCore';
import type { WriteCommonInput, WriteResult, WriteTool } from './writeCore';
import { durableStep, currentWriteRequest } from '../idempotency';

export const WRITE_TOOLS: WriteTool[] = [
  createEventTool,
  updateEventTool,
  createPropertyTool,
  updatePropertyTool,
  linkEventPropertyTool,
  unlinkEventPropertyTool,
  createIdentityRuleTool,
  setEventIdentifiersTool,
  createCatalogFieldTool,
];

export { writeCommonShape };

export type WriteHandler = (input: Record<string, unknown> & WriteCommonInput) => Promise<WriteResult>;

export function writeHandler(tool: WriteTool): WriteHandler {
  return async (input) => {
    const project = resolveProject(input.project_key);
    return durableStep('mutation', () => runWriteTool(project.id, tool, input, input.dry_run !== false));
  };
}

export const batchOperationSchema = z
  .object({ op: z.enum(WRITE_TOOLS.map((t) => t.name) as [string, ...string[]]) })
  .passthrough();

export interface BatchApplyInput extends WriteCommonInput {
  operations: Array<{ op: string } & Record<string, unknown>>;
}

export interface BatchApplyResult {
  dry_run: boolean;
  batch_id: string | null;
  total: number;
  applied: number;
  failed: number;
  not_run: number;
  results: Array<{ index: number; op: string; ok: boolean; result?: WriteResult; error?: { code: string; message: string } }>;
}

export async function batchApply(input: BatchApplyInput): Promise<BatchApplyResult> {
  const project = resolveProject(input.project_key);
  const dryRun = input.dry_run !== false;
  const results: BatchApplyResult['results'] = [];

  const loop = () => {
    for (let index = 0; index < input.operations.length; index++) {
      const { op: opName, ...args } = input.operations[index];
      try {
        const result = durableStep(`operation:${index}`, () => {
        const tool = WRITE_TOOLS.find((t) => t.name === opName);
        if (!tool) throw new McpToolError('UNKNOWN_OPERATION', `Unknown operation "${opName}". Allowed: ${WRITE_TOOLS.map((t) => t.name).join(', ')}.`);
        const op = tool.prepare(project.id, parseArgs(tool, args));
        return executeOp(op, !dryRun);
        });
        results.push({ index, op: opName, ok: true, result });
      } catch (err) {
        const code = (err as { code?: string })?.code ?? 'INTERNAL_ERROR';
        results.push({ index, op: opName, ok: false, error: { code, message: err instanceof Error ? err.message : String(err) } });
        return;
      }
    }
  };

  let batchId: string | null = null;
  if (dryRun) {
    withRollback(loop);
  } else {
    batchId = runWithImportBatch('mcp', loop, currentWriteRequest()?.batch_id).batchId;
  }

  const applied = results.filter((r) => r.ok).length;
  const failed = results.length - applied;
  return {
    dry_run: dryRun,
    batch_id: dryRun ? null : batchId,
    total: input.operations.length,
    applied,
    failed,
    not_run: input.operations.length - results.length,
    results,
  };
}

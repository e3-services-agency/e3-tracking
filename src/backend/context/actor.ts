/**
 * Actor context (D-44, T-3-01): who/what is making the current definition-mutating write, threaded
 * through an `AsyncLocalStorage` so `change-log.dal.ts`'s `recordChange` never needs an explicit
 * parameter passed down through every DAL call. Set once per request by the Express middleware
 * (`src/backend/middleware/actor.ts`, mounted right after `optionalAuth`), once per MCP tool call
 * by the MCP wrapper (T-3-02), and around an import apply / restore by the import services
 * (T-3-02) with `source: 'import:<format>'`/`'restore'` and a shared `batch_id`.
 *
 * Falls back to `{actor: 'system', source: 'system'}` for anything that runs outside a request or
 * a wrapped call (a direct DAL test, a migration, a script) -- `getActor()` always returns
 * something usable, never throws.
 */
import { AsyncLocalStorage } from 'node:async_hooks';
import { newId } from '../db/util';

export interface ActorContext {
  actor: string;
  source: string;
  batch_id?: string;
}

const DEFAULT_ACTOR: ActorContext = { actor: 'system', source: 'system' };

const storage = new AsyncLocalStorage<ActorContext>();

/**
 * Runs `fn` with `context` visible to every `getActor()` call it makes, directly or through an
 * async boundary (`AsyncLocalStorage` propagates across `await`/promises/timers, which is the
 * whole reason to use it here instead of a plain module-level variable: better-sqlite3 is
 * synchronous so this matters most for request-scoped propagation into whatever the route handler
 * awaits before or after the DAL call, not for the DAL call itself).
 */
export function runWithActor<T>(context: ActorContext, fn: () => T): T {
  return storage.run(context, fn);
}

/** The current actor context, or the `system` default outside any `runWithActor` call. */
export function getActor(): ActorContext {
  return storage.getStore() ?? DEFAULT_ACTOR;
}

/**
 * T-3-02 pre-QA fix round (INFO 6): the shared shape every import apply service (`dataMapping`,
 * `expirationSettings`, `dataManagerCustomers`, `dataManagerEvents`, and eventually `restore`,
 * T-3-05) needs -- a fresh `batch_id` and `source: 'import:<format>'`, layered onto whatever actor
 * is already in context (a human in the UI, or an MCP agent) so `getActor()`'s own `actor` survives
 * unchanged. Each service previously inlined these same three lines; extracted once here so a
 * future import format only has to call this, not re-derive the pattern. Returns `fn`'s result
 * alongside the `batchId` used, since every apply response echoes `batch_id` back to the caller
 * (D-44) -- `fn` itself never needs to know the id, only the `change_log` rows it triggers do.
 */
export function runWithImportBatch<T>(format: string, fn: () => T): { result: T; batchId: string } {
  const batchId = newId();
  const result = runWithActor({ ...getActor(), source: `import:${format}`, batch_id: batchId }, fn);
  return { result, batchId };
}

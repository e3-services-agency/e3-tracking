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

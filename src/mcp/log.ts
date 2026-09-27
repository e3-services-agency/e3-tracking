/**
 * MCP-only logging (T-2-10, D-19, D-33). Stdio is the transport's wire protocol (JSON-RPC frames on
 * stdout, read on stdin) so nothing in this process may ever write to `process.stdout` -- a stray
 * `console.log` would corrupt every message after it. Every log line goes to `process.stderr`
 * instead, which the MCP client (Claude Code) shows as the server's log output but never parses as
 * protocol. `src/backend/db/index.ts` is already silent (T-1-01: only `src/backend/server.ts` writes
 * to stdout, PLAN-PHASE2-2026-09-25.md verified fact); this module is the *only* place `src/mcp/*`
 * is allowed to log through.
 */

function line(level: string, args: unknown[]): void {
  const parts = args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : JSON.stringify(a)));
  process.stderr.write(`[mcp] ${level} ${parts.join(' ')}\n`);
}

export const log = {
  info: (...args: unknown[]): void => line('INFO', args),
  warn: (...args: unknown[]): void => line('WARN', args),
  error: (...args: unknown[]): void => line('ERROR', args),
};

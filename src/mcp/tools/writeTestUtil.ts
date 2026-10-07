/** Test helper for the write tools (T-5-01): drives the real `registerTools` wrapper (actor, error mapping) against a fake server. */
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from '../registerTools';
import { getDb } from '../../backend/db';

type Callback = (args: Record<string, unknown>) => Promise<{ isError?: boolean; content: { text: string }[] }>;

let callbacks: Map<string, Callback> | null = null;

export function toolNames(): string[] {
  load();
  return [...callbacks!.keys()];
}

function load(): void {
  if (callbacks) return;
  callbacks = new Map();
  const fake = {
    registerTool: (name: string, _config: unknown, cb: Callback) => {
      callbacks!.set(name, cb);
    },
  };
  registerTools(fake as unknown as McpServer);
}

export async function callTool<T = any>(name: string, args: Record<string, unknown>): Promise<{ isError: boolean; text: string; data: T }> {
  load();
  const res = await callbacks!.get(name)!(args);
  const text = res.content[0].text;
  let data: unknown = null;
  if (!res.isError) data = JSON.parse(text);
  return { isError: !!res.isError, text, data: data as T };
}

export function countRows(table: string): number {
  return (getDb().prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

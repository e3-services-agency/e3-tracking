/**
 * MCP stdio entry point (T-2-10, plan "MCP server", D-11/D-19/D-33): `npm run mcp` = `tsx
 * src/mcp/server.ts`. A sibling process to the Express API, sharing the same SQLite file
 * (`E3_DB_PATH`, default `./data/e3-tracking.sqlite`) through the same `getDb()` singleton and
 * migration runner -- no HTTP routes, no separate schema. All logging goes to stderr (`log.ts`);
 * nothing here may write to `process.stdout`, which stdio reserves for the JSON-RPC protocol.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { getDb } from '../backend/db';
import { registerTools } from './registerTools';
import { log } from './log';

async function main(): Promise<void> {
  // Applies pending migrations and opens the shared SQLite file up front, so the first tool call
  // never pays (or fails on) a cold migration run mid-request.
  getDb();

  const server = new McpServer({ name: 'e3-tracking', version: '1.0.0' });
  registerTools(server);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  log.info('e3-tracking MCP server ready on stdio');
}

main().catch((err) => {
  log.error('failed to start', err);
  process.exitCode = 1;
});

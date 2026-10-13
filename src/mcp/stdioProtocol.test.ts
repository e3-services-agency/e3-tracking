import { describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TOOL_POLICY } from './toolPolicy';
describe('patched SDK stdio protocol', () => {
    it('initializes a fresh sibling process and discovers/calls the same29 tools without HTTP credentials', async () => {
        const env = Object.fromEntries(Object.entries(process.env).filter((item): item is [
            string,
            string
        ] => typeof item[1] === 'string'));
        const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', 'tsx', 'src/mcp/server.ts'], env: { ...env, NODE_ENV: 'test', AUTH_MODE: 'local', E3_DB_PATH: ':memory:', E3_PROJECT_KEY: '' }, stderr: 'pipe' });
        const client = new Client({ name: 'e3-stdio-regression', version: '1' }, { capabilities: {} });
        try {
            await client.connect(transport);
            const tools = await client.listTools();
            expect(tools.tools).toHaveLength(29);
            expect(tools.tools.map(t => t.name).sort()).toEqual(Object.keys(TOOL_POLICY).sort());
            const projects = await client.callTool({ name: 'list_projects', arguments: {} });
            expect(projects.isError).not.toBe(true);
            expect(projects.content).toEqual([{ type: 'text', text: '[]' }]);
        }
        finally {
            await client.close();
            await transport.close();
        }
    }, 30000);
});

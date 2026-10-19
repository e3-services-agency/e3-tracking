import fs from 'node:fs';
import { expect, it } from 'vitest';
import { getToolInventory } from './registerTools';

it('keeps generated documentation and deployment inventory equal to real registration', () => {
  const inventory = getToolInventory();
  const document = fs.readFileSync(new URL('../../docs/MCP.md', import.meta.url), 'utf8');
  const generated = document.match(/<!-- BEGIN GENERATED MCP INVENTORY -->([\s\S]*?)<!-- END GENERATED MCP INVENTORY -->/)?.[1] ?? '';
  expect(generated).toContain(`Registered tools: **${inventory.length}**`);
  for (const tool of inventory) expect(generated).toContain('`' + tool.name + '`');
  expect(JSON.parse(fs.readFileSync(new URL('../../deploy/gcp/mcp-inventory.json', import.meta.url), 'utf8'))).toEqual(inventory);
});

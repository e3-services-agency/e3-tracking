import fs from 'node:fs';
import { getToolInventory } from '../src/mcp/registerTools';
const file = new URL('../docs/MCP.md', import.meta.url);
const tools = getToolInventory();
const manifest = new URL('../deploy/gcp/mcp-inventory.json', import.meta.url);
const manifestText = JSON.stringify(tools, null, 2) + '\n';
const generated = `<!-- BEGIN GENERATED MCP INVENTORY -->\nRegistered tools: **${tools.length}**. Visible counts depend on the authenticated grant.\n\n| Tool | Required scopes |\n| --- | --- |\n${tools.map(t => `| \`${t.name}\` | ${t.scopes.join(', ') || 'Any authenticated grant'} |`).join('\n')}\n<!-- END GENERATED MCP INVENTORY -->`;
const source = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
const pattern = /<!-- BEGIN GENERATED MCP INVENTORY -->[\s\S]*?<!-- END GENERATED MCP INVENTORY -->/;
if (process.argv.includes('--check')) {
  if (source.match(pattern)?.[0] !== generated) throw new Error('MCP inventory documentation is stale. Run scripts/generate-mcp-inventory.ts.');
  if (fs.readFileSync(manifest, 'utf8').replace(/\r\n/g, '\n') !== manifestText) throw new Error('MCP deployment inventory is stale.');
} else {
  fs.writeFileSync(file, pattern.test(source) ? source.replace(pattern, generated) : source + '\n\n' + generated + '\n');
  fs.writeFileSync(manifest, manifestText);
}

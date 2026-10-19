/** Read-only validation of captured MCP rows. Prints metrics only, never evidence bodies.
 * Run: node --import tsx scripts/verify-mcp-finding-rows.ts <findings.json>
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { summarizeFindingRows, compactFindingFields } from '../src/mcp/tools/findings';
import { paginate } from '../src/mcp/readOptions';
import type { FindingRow } from '../src/backend/dal/finding.dal';
import type { WithFindingPriority } from '../src/backend/services/findingPriority.service';

const rows = JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) as WithFindingPriority<FindingRow>[];
assert.ok(Array.isArray(rows));
const summary = summarizeFindingRows(rows);
assert.equal(summary.total, rows.length);
for (const key of ['by_status', 'by_priority', 'by_severity', 'by_comparison', 'by_kind'] as const) assert.equal(Object.values(summary[key]).reduce((sum, n) => sum + n, 0), rows.length);
assert.equal(summary.by_event.reduce((sum, row) => sum + row.count, 0), rows.length);
const compact = compactFindingFields;
const publicFields = Object.keys(rows[0] ?? {}).filter(key => key !== 'project_id');
const defaultPage = paginate(rows, {}, compact, publicFields);
assert.ok(JSON.stringify(summary).length < 5000);
assert.ok(JSON.stringify(defaultPage).length < 10000);
const concatenated = [];
for (let offset = 0; offset < rows.length; offset += 37) concatenated.push(...paginate(rows, { offset, limit: 37, include: 'detail' }, compact, publicFields).items);
assert.deepEqual(concatenated, rows.map(({ project_id: _project, ...row }) => row));
console.log(JSON.stringify({ rows: rows.length, summary_characters: JSON.stringify(summary).length, default_page_characters: JSON.stringify(defaultPage).length, detail_pages_match: true, by_status: summary.by_status }));

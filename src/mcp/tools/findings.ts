/**
 * `list_findings` (T-2-10, plan MCP table): default `status` is `open` (plan: "status? (default
 * open)") -- an agent asking "what's wrong" almost never wants resolved history unless it asks for
 * it explicitly. `event` accepts a name or id (`resolve.ts`).
 *
 * D-89 (T-5-47): derived priorities and ordering use the same service as internal GET /findings.
 * Compact pages omit long evidence/reasons unless selected; summary shares every filter.
 */
import * as FindingDAL from '../../backend/dal/finding.dal';
import {
  filterByFindingPriority,
  loadFindingPriorityContext,
  sortByFindingPriority,
  withFindingPriority,
  type WithFindingPriority,
} from '../../backend/services/findingPriority.service';
import { parseFindingPriorityFilter } from '../../domain/findingPriority';
import { McpToolError } from '../errors';
import { resolveEvent, resolveProject } from '../resolve';
import type { FindingRow } from '../../backend/dal/finding.dal';
import * as PropertyDAL from '../../backend/dal/property.dal';
import * as EventDAL from '../../backend/dal/event.dal';
import { referencesFor } from './references';
import { conditionalRead, paginate, readSnapshot, type ConditionalInput, type ListOptions } from '../readOptions';

export interface FindingsFilterInput {
  project_key?: string;
  event?: string;
  severity?: string;
  priority?: string;
  comparison?: string;
  kind?: string;
  status?: string;
  qa_run_id?: string;
  property?: string;
  first_seen_from?: string;
  first_seen_to?: string;
  last_seen_from?: string;
  last_seen_to?: string;
}

export interface ListFindingsInput extends FindingsFilterInput, ListOptions {}

export const compactFindingFields = ['id', 'finding_sequence', 'fingerprint', 'priority', 'priority_rank', 'status', 'severity', 'comparison', 'kind', 'event_id', 'event_name', 'property_id', 'property_name', 'first_seen_at', 'last_seen_at', 'resolved_at'] as const;
const compactFields = compactFindingFields;
const detailFields = [...compactFields, 'variant_id', 'observation_id', 'qa_run_id', 'resolved_by', 'message', 'expected_json', 'actual_json', 'priority_reasons', 'references'] as const;

/** Summary and list share exactly the same filtering and derived priorities. */
function matchingFindings(input: FindingsFilterInput) {
  const project = resolveProject(input.project_key);
  let priorities: ReturnType<typeof parseFindingPriorityFilter>;
  try {
    priorities = parseFindingPriorityFilter(input.priority);
  } catch (err) {
    throw new McpToolError('PRIORITY_INVALID', (err as Error).message);
  }
  const eventId = input.event ? resolveEvent(project.id, input.event).id : undefined;
  let propertyId: string | undefined;
  if (input.property) {
    const properties = PropertyDAL.listProperties(project.id);
    const matches = properties.filter(p => p.id === input.property || p.name === input.property);
    if (matches.length !== 1) throw new McpToolError('PROPERTY_INVALID', 'property must identify one project property; use its ID to disambiguate names.');
    propertyId = matches[0].id;
  }
  const ranges = ([['first_seen_from', 'first_seen_to'], ['last_seen_from', 'last_seen_to']] as const).map(([from, to]) => {
    const parse = (key: typeof from | typeof to) => {
      const value = input[key];
      if (value === undefined) return undefined;
      // Require an explicit timezone; never interpret dates in the server's local timezone.
      const time = Date.parse(value);
      if (!/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(time)) throw new McpToolError('VALIDATION_ERROR', `${key} must be an ISO timestamp with timezone.`);
      return time;
    };
    const min = parse(from), max = parse(to);
    if (min !== undefined && max !== undefined && min > max) throw new McpToolError('VALIDATION_ERROR', `${from} must be at or before ${to}.`);
    return { field: from.startsWith('first') ? 'first_seen_at' as const : 'last_seen_at' as const, min, max };
  });
  const rows = FindingDAL.listFindings(project.id, {
    comparison: input.comparison,
    kind: input.kind,
    severity: input.severity,
    event_id: eventId,
    status: input.status === 'all' ? undefined : input.status ?? 'open',
    qa_run_id: input.qa_run_id,
  }).filter(row => {
    if (propertyId && row.property_id !== propertyId) return false;
    return ranges.every(({ field, min, max }) => {
      const time = Date.parse(row[field]);
      return (min === undefined || time >= min) && (max === undefined || time <= max);
    });
  });
  const eventNames = new Map(EventDAL.listEvents(project.id).map(e => [e.id, e.name]));
  const propertyNames = new Map(PropertyDAL.listProperties(project.id).map(p => [p.id, p.name]));
  return sortByFindingPriority(filterByFindingPriority(withFindingPriority(rows, loadFindingPriorityContext(project.id)), priorities))
    .map(row => ({ ...row, event_name: eventNames.get(row.event_id) ?? null, property_name: propertyNames.get(row.property_id) ?? null }));
}

export async function listFindings(input: ListFindingsInput) {
  return readSnapshot(() => {
    const { limit: _limit, offset: _offset, fields: _fields, include: _include, ...filters } = input;
    const projectId = resolveProject(input.project_key).id;
    const refs = input.include || input.fields?.includes('references') ? referencesFor(projectId, 'finding') : [];
    const rows = matchingFindings(input).map(row => ({ ...row, references: refs.filter(ref => ref.target_id === row.id) }));
    return paginate(rows, input, compactFields, detailFields, { project_id: projectId, collection: 'findings', filters });
  });
}

export async function summarizeFindings(input: FindingsFilterInput) {
  return readSnapshot(() => summarizeFindingRows(matchingFindings(input)));
}

/** Pure projection also used to verify bounded summaries against captured MCP rows. */
export function summarizeFindingRows(rows: readonly (WithFindingPriority<FindingRow> & { event_name?: string | null })[]) {
  const counts = (field: keyof WithFindingPriority<FindingRow>) => {
    const groups = new Map<string, number>();
    for (const row of rows) {
      const key = String(row[field] ?? '(none)');
      groups.set(key, (groups.get(key) ?? 0) + 1);
    }
    return Object.fromEntries([...groups].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0));
  };
  const newest = (field: 'first_seen_at' | 'last_seen_at') => rows.reduce<string | null>((latest, row) => latest === null || Date.parse(row[field]) > Date.parse(latest) ? row[field] : latest, null);
  const byEvent = new Map<string | null, { event_id: string | null; event_name: string | null; count: number }>();
  for (const row of rows) {
    const item = byEvent.get(row.event_id) ?? { event_id: row.event_id, event_name: row.event_name ?? (row.event_id===null?'(not in plan)':null), count: 0 };
    item.count++; byEvent.set(row.event_id, item);
  }
  return { total: rows.length, by_status: counts('status'), by_priority: counts('priority'), by_severity: counts('severity'), by_comparison: counts('comparison'), by_kind: counts('kind'), by_event: [...byEvent.values()].sort((a, b) => (a.event_id ?? '').localeCompare(b.event_id ?? '')), newest_first_seen_at: newest('first_seen_at'), newest_last_seen_at: newest('last_seen_at') };
}

export async function getFinding(input: ConditionalInput & { project_key?: string; finding_id: string }) {
  const project = resolveProject(input.project_key);
  const row = FindingDAL.getFindingOrThrow(project.id, input.finding_id);
  const { project_id: _projectId, ...body } = withFindingPriority([row], loadFindingPriorityContext(project.id))[0];
  return conditionalRead(row.id, { ...body, event_name: EventDAL.listEvents(project.id).find(e => e.id === row.event_id)?.name ?? null, property_name: PropertyDAL.listProperties(project.id).find(p => p.id === row.property_id)?.name ?? null, references: referencesFor(project.id, 'finding', row.id) }, input);
}

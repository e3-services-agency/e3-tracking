import { getDb } from '../db';
import { isCommentTargetVisible } from '../dal/comment.dal';
import { NotFoundError } from '../errors';
import type { DiffJsonEntry } from '../dal/change-log.dal';
const fields: Record<string, readonly string[]> = {
 identity_rule: ['identifier_name','identity_type','name','transformations_json','sdk_call','trigger_text'],
 catalog: ['name','mapping_role','status','description','source_system','sync_method','update_frequency','catalog_type','purpose','kind','market','language','version','live_at'],
 catalog_field: ['name','description','data_type','is_lookup_key','is_searchable','is_required'],
 property_definition: ['name','description','formats_json','allowed_values_json','example_values_json'],
};
function scalar(value: unknown): unknown { return value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) ? value : null; }
function publicJson(value: unknown): unknown {
 if (Array.isArray(value)) return value.map(publicJson);
 if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([key]) => !key.startsWith('internal_')).map(([key,item]) => [key,publicJson(item)]));
 return scalar(value);
}
function publicValue(field: string, value: unknown): unknown {
 if (!field.endsWith('_json')) return scalar(value);
 let parsed = value;
 if (typeof value === 'string') { try { parsed = JSON.parse(value); } catch { return null; } }
 if (!Array.isArray(parsed)) return null;
 if (['formats_json','transformations_json'].includes(field)) return parsed.filter((x) => typeof x === 'string');
 return parsed.map((x) => { if (!x || typeof x !== 'object' || Array.isArray(x)) return scalar(x); const item = x as Record<string, unknown>; const allowed = field === 'allowed_values_json' ? ['value','label','standard_event'] : ['value']; return Object.fromEntries(allowed.filter((key) => key in item).map((key) => [key,key === 'value' ? publicJson(item[key]) : scalar(item[key])])); });
}
/** Project/actor/source/private envelopes never enter this exact-target public projection. */
export function sharedHistory(projectId: string, entityType: string, entityId: string, limit = 50, before?: string) {
  if (!fields[entityType] || entityType === 'catalog_field' || !isCommentTargetVisible(projectId, entityType, entityId)) {
    throw new NotFoundError('Target not found.');
  }
  const table = entityType === 'identity_rule' ? 'identity_rules' : entityType === 'catalog' ? 'catalogs' : 'property_definitions';
  const label = (getDb().prepare(`SELECT name FROM ${table} WHERE id = ?`).get(entityId) as {name: string}).name;
  const children = entityType === 'catalog'
    ? new Map((getDb().prepare('SELECT id,name FROM catalog_fields WHERE catalog_id = ?').all(entityId) as {id:string;name:string}[]).map((r) => [r.id,r.name]))
    : new Map<string,string>();
  type StoredHistory = {id:string;entity_type:string;entity_id:string;action:string;actor:string;changed_at:string;diff_json:string};
  const stored = getDb().prepare(`SELECT id,entity_type,entity_id,action,actor,changed_at,diff_json
    FROM change_log WHERE project_id = ? AND (entity_id = ? OR parent_entity_id = ?)
    ORDER BY changed_at DESC,id DESC`).iterate(projectId,entityId,entityId) as Iterable<StoredHistory>;
  const page: {id:string;entity_type:string;entity_id:string;entity_label:string;action:string;actor:string;changed_at:string;diff_json:DiffJsonEntry[]}[] = [];
  let cursorFound = before === undefined;
  let hasMore = false;
  // Iterate rather than loading an entire edit history. Private-only rows never consume a slot.
  for (const row of stored) {
    if (!(row.entity_id === entityId && row.entity_type === entityType) &&
        !(entityType === 'catalog' && row.entity_type === 'catalog_field' && children.has(row.entity_id))) continue;
    let raw: unknown;
    try { raw = JSON.parse(row.diff_json); } catch { continue; }
    if (!Array.isArray(raw)) continue;
    const diff_json = raw.flatMap((d: DiffJsonEntry) => !d || !fields[row.entity_type]?.includes(d.field) ? []
      : [{field:d.field,before:publicValue(d.field,d.before),after:publicValue(d.field,d.after)}])
      .filter((d) => JSON.stringify(d.before) !== JSON.stringify(d.after));
    if (!diff_json.length) continue;
    if (!cursorFound) { if (row.id === before) cursorFound = true; continue; }
    if (page.length === limit) { hasMore = true; break; }
    page.push({id:row.id,entity_type:row.entity_type,entity_id:row.entity_id,
      entity_label:children.get(row.entity_id) ?? label,action:row.action,
      actor:row.actor === 'system' ? 'System' : 'Staff',changed_at:row.changed_at,diff_json});
  }
  if (!cursorFound) throw new NotFoundError('History cursor not found.');
  return {rows:page,next_cursor:hasMore ? page.at(-1)?.id ?? null : null};
}

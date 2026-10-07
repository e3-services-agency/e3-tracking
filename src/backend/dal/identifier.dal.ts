/**
 * Identifiers registry DAL (D-69, T-4-35): the project's fixed list of Bloomreach hard ids, soft ids
 * and the cookie. Identity rules reference one identifier (`identity_rules.identifier_id`);
 * `identifier_name`/`identity_type` on the rule stay in sync for old readers, and
 * `events.identifiers_json` stores identifier names, so a rename cascades to both.
 */
import { getDb } from '../db';
import { newId, nowIso, mapWriteError, parseJsonColumn } from '../db/util';
import { BadRequestError, IdentifierExistsError, IdentifierInUseError, NotFoundError, ValidationError } from '../errors';
import { IDENTITY_TYPES } from '../../domain/enums';
import { validateAsciiName } from './validators';
import * as ChangeLogDAL from './change-log.dal';
import * as EventDAL from './event.dal';

export interface IdentifierRow {
  id: string;
  project_id: string;
  name: string;
  type: string;
  description: string | null;
  is_cookie: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface IdentifierInput {
  name: string;
  type: string;
  description?: string | null;
  is_cookie?: boolean;
  sort_order?: number;
}

export interface IdentifierWithUsage extends IdentifierRow {
  rule_count: number;
  event_count: number;
}

type DbRow = Omit<IdentifierRow, 'is_cookie'> & { is_cookie: number };

function mapRow(row: DbRow): IdentifierRow {
  return { ...row, is_cookie: row.is_cookie === 1 };
}

export function listIdentifiers(projectId: string): IdentifierRow[] {
  const rows = getDb()
    .prepare('SELECT * FROM identifiers WHERE project_id = ? ORDER BY sort_order, created_at, name')
    .all(projectId) as DbRow[];
  return rows.map(mapRow);
}

export function getIdentifierById(projectId: string, id: string): IdentifierRow | null {
  const row = getDb().prepare('SELECT * FROM identifiers WHERE id = ? AND project_id = ?').get(id, projectId) as DbRow | undefined;
  return row ? mapRow(row) : null;
}

export function getIdentifierOrThrow(projectId: string, id: string): IdentifierRow {
  const row = getIdentifierById(projectId, id);
  if (!row) throw new NotFoundError('Identifier not found.', 'identifier');
  return row;
}

export function findIdentifierByName(projectId: string, name: string): IdentifierRow | null {
  const row = getDb()
    .prepare('SELECT * FROM identifiers WHERE project_id = ? AND lower(name) = lower(?)')
    .get(projectId, name.trim()) as DbRow | undefined;
  return row ? mapRow(row) : null;
}

/** Events whose `identifiers_json` lists `name` (names are stored verbatim). */
function eventsUsing(projectId: string, name: string): { id: string; identifiers: string[] }[] {
  const rows = getDb()
    .prepare('SELECT id, identifiers_json FROM events WHERE project_id = ? AND deleted_at IS NULL AND identifiers_json IS NOT NULL')
    .all(projectId) as { id: string; identifiers_json: string }[];
  const out: { id: string; identifiers: string[] }[] = [];
  for (const r of rows) {
    const list = parseJsonColumn<string[]>(r.identifiers_json, []);
    if (list.includes(name)) out.push({ id: r.id, identifiers: list });
  }
  return out;
}

export function usageOf(projectId: string, identifier: IdentifierRow): { rules: number; events: number } {
  const rules = (
    getDb().prepare('SELECT COUNT(*) as n FROM identity_rules WHERE project_id = ? AND identifier_id = ?').get(projectId, identifier.id) as { n: number }
  ).n;
  return { rules, events: eventsUsing(projectId, identifier.name).length };
}

/** `GET /identifiers`: each identifier with how many rules (acts) and events (explicit lists) reference it. */
export function listIdentifiersWithUsage(projectId: string): IdentifierWithUsage[] {
  const ids = listIdentifiers(projectId);
  const ruleCounts = new Map(
    (
      getDb()
        .prepare('SELECT identifier_id, COUNT(*) as n FROM identity_rules WHERE project_id = ? AND identifier_id IS NOT NULL GROUP BY identifier_id')
        .all(projectId) as { identifier_id: string; n: number }[]
    ).map((r) => [r.identifier_id, r.n])
  );
  const eventCounts = new Map<string, number>();
  const rows = getDb()
    .prepare('SELECT identifiers_json FROM events WHERE project_id = ? AND deleted_at IS NULL AND identifiers_json IS NOT NULL')
    .all(projectId) as { identifiers_json: string }[];
  for (const r of rows) {
    for (const n of new Set(parseJsonColumn<string[]>(r.identifiers_json, []))) eventCounts.set(n, (eventCounts.get(n) ?? 0) + 1);
  }
  return ids.map((i) => ({ ...i, rule_count: ruleCounts.get(i.id) ?? 0, event_count: eventCounts.get(i.name) ?? 0 }));
}

function validateType(type: string): void {
  if (!IDENTITY_TYPES.includes(type as (typeof IDENTITY_TYPES)[number])) {
    throw new ValidationError(`type must be one of ${IDENTITY_TYPES.join(', ')}.`, 'type');
  }
}

function assertNameFree(projectId: string, name: string, exceptId?: string): void {
  const row = findIdentifierByName(projectId, name);
  if (row && row.id !== exceptId) throw new IdentifierExistsError(name);
}

export function createIdentifier(projectId: string, input: IdentifierInput): IdentifierRow {
  const name = input.name?.trim() ?? '';
  if (!name) throw new ValidationError('Identifier name is required.', 'name');
  validateAsciiName(name, 'name');
  validateType(input.type);
  assertNameFree(projectId, name);
  const db = getDb();
  const id = newId();
  const now = nowIso();
  const run = db.transaction(() => {
    const maxOrder = (db.prepare('SELECT COALESCE(MAX(sort_order), -1) as m FROM identifiers WHERE project_id = ?').get(projectId) as { m: number }).m;
    try {
      db.prepare(
        `INSERT INTO identifiers (id, project_id, name, type, description, is_cookie, sort_order, created_at, updated_at)
         VALUES (@id, @project_id, @name, @type, @description, @is_cookie, @sort_order, @now, @now)`
      ).run({
        id,
        project_id: projectId,
        name,
        type: input.type,
        description: input.description?.trim() || null,
        is_cookie: (input.is_cookie ?? name.toLowerCase() === 'cookie') ? 1 : 0,
        sort_order: input.sort_order ?? maxOrder + 1,
        now,
      });
    } catch (err) {
      mapWriteError(err, `An identifier "${name}" already exists in this project.`, `Failed to create identifier: ${(err as Error).message}`);
    }
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'identifier',
      entityId: id,
      entityLabel: name,
      action: 'create',
      before: null,
      after: getIdentifierOrThrow(projectId, id) as unknown as Record<string, unknown>,
    });
  });
  run();
  return getIdentifierOrThrow(projectId, id);
}

/** Finds the identifier by name (case-insensitive) or creates it; used by the rules API compatibility path. */
export function findOrCreateIdentifier(projectId: string, name: string, type: string): IdentifierRow {
  const existing = findIdentifierByName(projectId, name);
  if (existing) return existing;
  return createIdentifier(projectId, { name, type });
}

export function updateIdentifier(projectId: string, id: string, updates: Partial<IdentifierInput>): IdentifierRow {
  const existing = getIdentifierOrThrow(projectId, id);
  const patch: Record<string, unknown> = {};
  if (updates.name !== undefined) {
    const name = updates.name.trim();
    if (!name) throw new ValidationError('Identifier name is required.', 'name');
    validateAsciiName(name, 'name');
    if (name !== existing.name) assertNameFree(projectId, name, id);
    patch.name = name;
  }
  if (updates.type !== undefined) {
    validateType(updates.type);
    patch.type = updates.type;
  }
  if (updates.description !== undefined) patch.description = updates.description?.trim() || null;
  if (updates.is_cookie !== undefined) patch.is_cookie = updates.is_cookie ? 1 : 0;
  if (updates.sort_order !== undefined) patch.sort_order = updates.sort_order;
  if (Object.keys(patch).length === 0) return existing;
  patch.updated_at = nowIso();
  const setClause = Object.keys(patch).map((k) => `${k} = @${k}`).join(', ');
  const db = getDb();
  const run = db.transaction(() => {
    try {
      db.prepare(`UPDATE identifiers SET ${setClause} WHERE id = @id AND project_id = @project_id`).run({ ...patch, id, project_id: projectId });
    } catch (err) {
      mapWriteError(err, 'This identifier conflicts with an existing one.', `Failed to update identifier: ${(err as Error).message}`);
    }
    const after = getIdentifierOrThrow(projectId, id);
    // Cascade: rules keep identifier_name/identity_type in sync; events list names.
    if (after.name !== existing.name || after.type !== existing.type) {
      db.prepare('UPDATE identity_rules SET identifier_name = ?, identity_type = ?, updated_at = ? WHERE project_id = ? AND identifier_id = ?').run(
        after.name,
        after.type,
        patch.updated_at as string,
        projectId,
        id
      );
    }
    if (after.name !== existing.name) {
      for (const ev of eventsUsing(projectId, existing.name)) {
        const renamed = [...new Set(ev.identifiers.map((n) => (n === existing.name ? after.name : n)))];
        EventDAL.updateEvent(projectId, ev.id, { identifiers_json: renamed });
      }
    }
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'identifier',
      entityId: id,
      entityLabel: after.name,
      action: 'update',
      before: existing as unknown as Record<string, unknown>,
      after: after as unknown as Record<string, unknown>,
    });
  });
  run();
  return getIdentifierOrThrow(projectId, id);
}

export function deleteIdentifier(projectId: string, id: string): void {
  const existing = getIdentifierOrThrow(projectId, id);
  const usage = usageOf(projectId, existing);
  if (usage.rules > 0 || usage.events > 0) throw new IdentifierInUseError(existing.name, usage);
  const db = getDb();
  db.transaction(() => {
    db.prepare('DELETE FROM identifiers WHERE id = ? AND project_id = ?').run(id, projectId);
    ChangeLogDAL.recordChange({
      projectId,
      entityType: 'identifier',
      entityId: id,
      entityLabel: existing.name,
      action: 'delete',
      before: existing as unknown as Record<string, unknown>,
      after: null,
    });
  })();
}

/** `orderedIds` must be exactly this project's identifier ids; sort_order becomes the index. */
export function reorderIdentifiers(projectId: string, orderedIds: string[]): IdentifierRow[] {
  const existing = listIdentifiers(projectId);
  const byId = new Map(existing.map((i) => [i.id, i]));
  const unique = [...new Set(orderedIds)];
  if (unique.length !== existing.length || !unique.every((id) => byId.has(id))) {
    throw new BadRequestError('ids must be exactly the set of this project identifier ids.', 'ids');
  }
  const db = getDb();
  const now = nowIso();
  db.transaction(() => {
    const stmt = db.prepare('UPDATE identifiers SET sort_order = ?, updated_at = ? WHERE id = ? AND project_id = ?');
    unique.forEach((id, index) => {
      const before = byId.get(id)!;
      if (before.sort_order === index) return;
      stmt.run(index, now, id, projectId);
      ChangeLogDAL.recordChange({
        projectId,
        entityType: 'identifier',
        entityId: id,
        entityLabel: before.name,
        action: 'update',
        before: { sort_order: before.sort_order },
        after: { sort_order: index },
      });
    });
  })();
  return listIdentifiers(projectId);
}

/**
 * Creates the registry entries for rules that have none (a backup from before 0032, or a hand-built
 * rule row), by case-insensitive name, hard winning on a type conflict, then links the rules. No
 * change_log rows: used inside restore, which writes its own single `restore` row.
 */
export function backfillIdentifiersFromRules(projectId: string): void {
  const db = getDb();
  const rules = db
    .prepare('SELECT id, identifier_name, identity_type FROM identity_rules WHERE project_id = ? AND identifier_id IS NULL ORDER BY sort_order, created_at')
    .all(projectId) as { id: string; identifier_name: string; identity_type: string }[];
  if (rules.length === 0) return;
  const now = nowIso();
  const byLower = new Map(listIdentifiers(projectId).map((i) => [i.name.toLowerCase(), i]));
  let order = byLower.size;
  for (const r of rules) {
    const key = r.identifier_name.toLowerCase();
    let ident = byLower.get(key);
    if (!ident) {
      const id = newId();
      db.prepare(
        'INSERT INTO identifiers (id, project_id, name, type, description, is_cookie, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?)'
      ).run(id, projectId, r.identifier_name, r.identity_type === 'hard' ? 'hard' : 'soft', key === 'cookie' ? 1 : 0, order++, now, now);
      ident = getIdentifierOrThrow(projectId, id);
      byLower.set(key, ident);
    } else if (r.identity_type === 'hard' && ident.type !== 'hard') {
      db.prepare("UPDATE identifiers SET type = 'hard' WHERE id = ?").run(ident.id);
      ident = { ...ident, type: 'hard' };
      byLower.set(key, ident);
    }
    db.prepare('UPDATE identity_rules SET identifier_id = ?, identifier_name = ?, identity_type = ? WHERE id = ?').run(ident.id, ident.name, ident.type, r.id);
  }
}

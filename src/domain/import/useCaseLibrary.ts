/**
 * Parser for the `e3-use-case-library` format (D-47, D-57, T-3-06): E3's own format for the use
 * case template library (`samples/use-case-library-sample.json`), not a Bloomreach export. Pure,
 * strict-but-forgiving like the Bloomreach parsers (`dataMapping.ts`, `expirationSettings.ts`):
 * malformed pieces become warnings and are dropped, never a thrown exception. No DB or Express
 * import (domain-model skill).
 *
 * Shape (D-47, D-57):
 * ```
 * { format: 'e3-use-case-library', version: 1,
 *   templates: [{ code, name, type: 'marketing'|'transactional', description?, narrative_template?,
 *     tags?: { channels?[], goals?[], tiers?[], kpis?[], industries?[] },
 *     flags?: { new?: boolean, popular?: boolean },
 *     default_requirements: [{ target_kind, event_name?, property_name?,
 *       condition?: {property_name, value}, level: 'R'|'O', note? }] }] }
 * ```
 *
 * Template-level drops (whole template skipped, one warning): missing/blank `code`, a `code`
 * already used earlier in the same file (first occurrence wins), missing/blank `name`, or a `type`
 * outside `USE_CASE_TYPES`. Requirement-level drops (that one `default_requirements` entry skipped,
 * the rest of the template is kept): `target_kind` outside `LIBRARY_TARGET_KINDS`, or a missing
 * `event_name` on a target_kind that needs one. Tag values outside the suggested vocabularies (D-57)
 * are dropped individually with a warning; the template itself is kept. `level` defaults to `'O'`
 * silently (`use-case-template.dal.ts`'s `resolveOne` already does the same for a bad/missing level
 * at instantiate time; keeping the same default here means a preview and an instantiate agree on
 * what an omitted level means).
 */
import {
  USE_CASE_LIBRARY_FORMAT,
  USE_CASE_LIBRARY_VERSION,
  USE_CASE_TYPES,
  REQUIREMENT_TARGET_KINDS,
  REQUIREMENT_LEVELS,
  LIBRARY_CHANNELS,
  LIBRARY_GOALS,
  LIBRARY_TIERS,
  LIBRARY_KPIS,
  LIBRARY_INDUSTRIES,
  type UseCaseType,
} from '../enums';

/**
 * Target kinds this format's `default_requirements[].target_kind` may use. Adds `catalog_attribute`
 * and `consent` (D-57) ahead of `REQUIREMENT_TARGET_KINDS` gaining them in T-3-10: a template file
 * using either validates cleanly here and instantiates as a `gap` requirement (an unresolved,
 * clearly-noted placeholder) until T-3-10 adds real resolution for those two kinds.
 */
export const LIBRARY_TARGET_KINDS = [...REQUIREMENT_TARGET_KINDS, 'catalog_attribute', 'consent'] as const;
export type LibraryTargetKind = (typeof LIBRARY_TARGET_KINDS)[number];

/** `target_kind`s whose requirement entry needs `event_name` to mean anything. */
const EVENT_SCOPED_TARGET_KINDS = new Set(['event', 'event_property', 'variant', 'variant_property']);

export interface LibraryCondition {
  property_name: string;
  value: string;
}

export interface LibraryRequirement {
  target_kind: string;
  event_name?: string;
  property_name?: string;
  condition?: LibraryCondition;
  level: string;
  note?: string;
}

export interface LibraryTags {
  channels: string[];
  goals: string[];
  tiers: string[];
  kpis: string[];
  industries: string[];
}

export interface LibraryFlags {
  new: boolean;
  popular: boolean;
}

export interface LibraryTemplate {
  code: string;
  name: string;
  type: string;
  description: string | null;
  narrative_template: string | null;
  tags: LibraryTags;
  flags: LibraryFlags;
  default_requirements: LibraryRequirement[];
}

export interface UseCaseLibraryModel {
  templates: LibraryTemplate[];
  warnings: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseStringArray(
  value: unknown,
  allowed: readonly string[],
  path: string,
  warnings: string[]
): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warnings.push(`${path} must be an array; ignored.`);
    return [];
  }
  const result: string[] = [];
  for (const item of value) {
    if (typeof item !== 'string' || !item.trim()) {
      warnings.push(`${path} contains a non-string value; skipped.`);
      continue;
    }
    const v = item.trim();
    if (!allowed.includes(v)) {
      warnings.push(`${path} value "${v}" is not one of the suggested vocabulary (${allowed.join(', ')}); kept with a warning.`);
    }
    result.push(v);
  }
  return result;
}

function parseTags(value: unknown, path: string, warnings: string[]): LibraryTags {
  if (value === undefined || value === null) {
    return { channels: [], goals: [], tiers: [], kpis: [], industries: [] };
  }
  if (!isPlainObject(value)) {
    warnings.push(`${path} must be an object; ignored.`);
    return { channels: [], goals: [], tiers: [], kpis: [], industries: [] };
  }
  return {
    channels: parseStringArray(value.channels, LIBRARY_CHANNELS, `${path}.channels`, warnings),
    goals: parseStringArray(value.goals, LIBRARY_GOALS, `${path}.goals`, warnings),
    tiers: parseStringArray(value.tiers, LIBRARY_TIERS, `${path}.tiers`, warnings),
    kpis: parseStringArray(value.kpis, LIBRARY_KPIS, `${path}.kpis`, warnings),
    industries: parseStringArray(value.industries, LIBRARY_INDUSTRIES, `${path}.industries`, warnings),
  };
}

function parseFlags(value: unknown, path: string, warnings: string[]): LibraryFlags {
  if (value === undefined || value === null) return { new: false, popular: false };
  if (!isPlainObject(value)) {
    warnings.push(`${path} must be an object; ignored.`);
    return { new: false, popular: false };
  }
  return { new: value.new === true, popular: value.popular === true };
}

function parseCondition(value: unknown, path: string, warnings: string[]): LibraryCondition | undefined {
  if (value === undefined || value === null) return undefined;
  if (!isPlainObject(value) || typeof value.property_name !== 'string' || !value.property_name.trim()) {
    warnings.push(`${path} must be {property_name, value}; ignored.`);
    return undefined;
  }
  if (typeof value.value !== 'string' && typeof value.value !== 'number' && typeof value.value !== 'boolean') {
    warnings.push(`${path}.value must be a primitive; ignored.`);
    return undefined;
  }
  return { property_name: value.property_name.trim(), value: String(value.value) };
}

function parseRequirement(
  templateCode: string,
  index: number,
  raw: unknown,
  warnings: string[]
): LibraryRequirement | null {
  const path = `templates[code=${templateCode}].default_requirements[${index}]`;
  if (!isPlainObject(raw)) {
    warnings.push(`${path} must be an object; skipped.`);
    return null;
  }
  const targetKind = raw.target_kind;
  if (typeof targetKind !== 'string' || !(LIBRARY_TARGET_KINDS as readonly string[]).includes(targetKind)) {
    warnings.push(`${path}.target_kind "${String(targetKind)}" is not one of ${LIBRARY_TARGET_KINDS.join(', ')}; skipped.`);
    return null;
  }
  const eventName = typeof raw.event_name === 'string' ? raw.event_name.trim() : '';
  if (EVENT_SCOPED_TARGET_KINDS.has(targetKind) && !eventName) {
    warnings.push(`${path} is missing event_name, required for target_kind "${targetKind}"; skipped.`);
    return null;
  }
  const propertyName = typeof raw.property_name === 'string' ? raw.property_name.trim() : '';
  const level =
    typeof raw.level === 'string' && (REQUIREMENT_LEVELS as readonly string[]).includes(raw.level) ? raw.level : 'O';
  const note = typeof raw.note === 'string' && raw.note.trim() ? raw.note.trim() : undefined;
  const condition = parseCondition(raw.condition, `${path}.condition`, warnings);

  const requirement: LibraryRequirement = { target_kind: targetKind, level };
  if (eventName) requirement.event_name = eventName;
  if (propertyName) requirement.property_name = propertyName;
  if (condition) requirement.condition = condition;
  if (note) requirement.note = note;
  return requirement;
}

function parseTemplate(index: number, raw: unknown, seenCodes: Set<string>, warnings: string[]): LibraryTemplate | null {
  const path = `templates[${index}]`;
  if (!isPlainObject(raw)) {
    warnings.push(`${path} must be an object; skipped.`);
    return null;
  }
  const code = typeof raw.code === 'string' ? raw.code.trim() : '';
  if (!code) {
    warnings.push(`${path} is missing "code"; skipped.`);
    return null;
  }
  if (seenCodes.has(code)) {
    warnings.push(`${path} duplicates code "${code}" already seen earlier in this file; skipped.`);
    return null;
  }
  const name = typeof raw.name === 'string' ? raw.name.trim() : '';
  if (!name) {
    warnings.push(`templates[code=${code}] is missing "name"; skipped.`);
    return null;
  }
  if (typeof raw.type !== 'string' || !USE_CASE_TYPES.includes(raw.type as UseCaseType)) {
    warnings.push(`templates[code=${code}].type "${String(raw.type)}" is not one of ${USE_CASE_TYPES.join(', ')}; skipped.`);
    return null;
  }

  seenCodes.add(code);

  const rawRequirements = Array.isArray(raw.default_requirements) ? raw.default_requirements : [];
  if (raw.default_requirements !== undefined && !Array.isArray(raw.default_requirements)) {
    warnings.push(`templates[code=${code}].default_requirements must be an array; treated as empty.`);
  }
  const default_requirements = rawRequirements
    .map((item, i) => parseRequirement(code, i, item, warnings))
    .filter((r): r is LibraryRequirement => r !== null);

  return {
    code,
    name,
    type: raw.type,
    description: typeof raw.description === 'string' && raw.description.trim() ? raw.description.trim() : null,
    narrative_template:
      typeof raw.narrative_template === 'string' && raw.narrative_template.trim() ? raw.narrative_template.trim() : null,
    tags: parseTags(raw.tags, `templates[code=${code}].tags`, warnings),
    flags: parseFlags(raw.flags, `templates[code=${code}].flags`, warnings),
    default_requirements,
  };
}

export function parseUseCaseLibrary(json: unknown): UseCaseLibraryModel {
  const warnings: string[] = [];
  if (!isPlainObject(json)) {
    return { templates: [], warnings: ['use case library JSON must be an object.'] };
  }
  if (json.format !== USE_CASE_LIBRARY_FORMAT) {
    warnings.push(`format "${String(json.format)}" is not "${USE_CASE_LIBRARY_FORMAT}"; parsing anyway.`);
  }
  if (json.version !== USE_CASE_LIBRARY_VERSION) {
    warnings.push(`version "${String(json.version)}" is not ${USE_CASE_LIBRARY_VERSION}; parsing anyway.`);
  }
  if (!Array.isArray(json.templates)) {
    return { templates: [], warnings: [...warnings, 'templates must be an array.'] };
  }

  const seenCodes = new Set<string>();
  const templates = json.templates
    .map((raw, index) => parseTemplate(index, raw, seenCodes, warnings))
    .filter((t): t is LibraryTemplate => t !== null);

  return { templates, warnings };
}

/**
 * Legacy tracking-sheet importer, pure half (T-4-34): parses the E3 Google-Sheet template (as plain
 * cell grids, one per worksheet) and plans the idempotent import against an existing project.
 * No server, database or xlsx-library imports; `scripts/import-tracking-sheet.mjs` reads the workbook
 * into grids, fetches the project through the REST API and executes the plan.
 *
 * Rules: create what is missing (matched by name), fill only EMPTY fields of an existing row, never
 * delete, never overwrite a non-empty value (a differing one is reported as a conflict).
 * Strict-but-forgiving like the other importers: a malformed piece becomes a warning, never a throw.
 */
import { classifyEventType, PLATFORM_EVENT_TYPES, SDK_EVENT_TYPES } from '../bloomreach';
import {
  ENTITY_STATUSES,
  EVENT_STATUSES,
  PRIORITIES,
  PROPERTY_DATA_FORMATS,
  PROPERTY_DATA_TYPES,
  type ImplementationMethod,
} from '../enums';
import { SYSTEM_CUSTOMER_PROPERTIES } from '../propertyCategory';

// ---------------------------------------------------------------------------
// Cell helpers
// ---------------------------------------------------------------------------

export type Cell = unknown;
export type Grid = Cell[][];
/** Worksheet name -> rows (0-based) of cells (0-based). Cells are plain values, see `cleanCell`. */
export type RawSheets = Record<string, Grid>;

const ERROR_CELLS = new Set(['#REF!', '#N/A', '#VALUE!', '#NAME?', '#DIV/0!', '#NUM!', '#NULL!', '#ERROR!']);

export function isErrorCell(v: Cell): boolean {
  return typeof v === 'string' && ERROR_CELLS.has(v.trim().toUpperCase());
}

/** Trimmed string, or `null` for empty/error cells. Numbers and booleans are stringified. */
export function cellText(v: Cell): string | null {
  if (v === null || v === undefined) return null;
  if (isErrorCell(v)) return null;
  if (v instanceof Date) return v.toISOString();
  const s = String(v).replace(/ /g, ' ').trim();
  return s === '' ? null : s;
}

export function cellBool(v: Cell): boolean | null {
  if (typeof v === 'boolean') return v;
  const s = cellText(v)?.toLowerCase();
  if (s === 'true' || s === 'yes') return true;
  if (s === 'false' || s === 'no') return false;
  return null;
}

/** Removes emoji, variation selectors and leading symbols from a label ("🛍️ Product Related" -> "Product Related"). */
export function stripEmoji(label: string | null | undefined): string | null {
  if (!label) return null;
  const s = label
    .replace(/(?![©®™])[\p{Extended_Pictographic}\p{Emoji_Presentation}‍︎️]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return s === '' ? null : s;
}

function normHeader(v: Cell): string {
  const s = cellText(v) ?? '';
  return (stripEmoji(s) ?? '')
    .replace(/\s*\(\d+\)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toUpperCase();
}

function normSheetName(name: string): string {
  return (stripEmoji(name) ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9& ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export const SHEET_KEYS = {
  events: 'events',
  properties: 'properties',
  customerProperties: 'customer properties',
  identity: 'identity',
  catalogs: 'catalogs',
  attributes: 'events & event attributes',
  dropdowns: 'dropdowns',
} as const;

function findSheet(raw: RawSheets, key: string): Grid | null {
  for (const [name, grid] of Object.entries(raw)) {
    if (normSheetName(name) === key) return grid;
  }
  return null;
}

interface TableRow {
  /** 1-based worksheet row number, for messages. */
  row: number;
  cells: Cell[];
  get: (header: string) => Cell;
}

/** Finds the header row by its known header cells and returns the data rows below it. */
function readTable(grid: Grid, required: string[]): { rows: TableRow[]; headerRow: number } | null {
  for (let i = 0; i < grid.length; i++) {
    const headers = (grid[i] ?? []).map(normHeader);
    if (!required.every((h) => headers.includes(h))) continue;
    const index = new Map<string, number>();
    headers.forEach((h, ci) => {
      if (h && !index.has(h)) index.set(h, ci);
    });
    const rows: TableRow[] = [];
    for (let r = i + 1; r < grid.length; r++) {
      const cells = grid[r] ?? [];
      if (cells.every((c) => cellText(c) === null && !isErrorCell(c) && typeof c !== 'boolean')) continue;
      rows.push({
        row: r + 1,
        cells,
        get: (h) => {
          const ci = index.get(h);
          return ci === undefined ? null : cells[ci];
        },
      });
    }
    return { rows, headerRow: i + 1 };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Value mappers (exported for tests)
// ---------------------------------------------------------------------------

const lower = (v: Cell): string | null => cellText(v)?.toLowerCase() ?? null;

export function mapPriority(v: Cell): string | null {
  const s = lower(v);
  return s && (PRIORITIES as readonly string[]).includes(s) ? s : null;
}

/** Event status: `code review` -> `in_review`, TBD/unknown -> null. */
export function mapEventStatus(v: Cell): string | null {
  const s = lower(v)?.replace(/[\s-]+/g, '_');
  if (!s) return null;
  if (s === 'code_review') return 'in_review';
  return (EVENT_STATUSES as readonly string[]).includes(s) ? s : null;
}

/** Status of properties, catalogs and identity rules (no in_review step): in_review -> planned. */
export function mapEntityStatus(v: Cell): string | null {
  const s = mapEventStatus(v);
  if (!s) return null;
  if (s === 'in_review') return 'planned';
  return (ENTITY_STATUSES as readonly string[]).includes(s) ? s : null;
}

export interface MappedType {
  data_type: string;
  /** Set when the sheet value was unusable and `string` was assumed. */
  defaulted_reason: string | null;
}

export function mapDataType(v: Cell): MappedType {
  const s = lower(v);
  if (!s) {
    return { data_type: 'string', defaulted_reason: isErrorCell(v) ? `data type is ${String(v).trim()}, defaulted to string` : 'no data type, defaulted to string' };
  }
  const table: Record<string, string> = {
    string: 'string',
    text: 'string',
    number: 'number',
    integer: 'number',
    float: 'number',
    boolean: 'boolean',
    datetime: 'timestamp',
    date: 'timestamp',
    timestamp: 'timestamp',
    list: 'array',
    array: 'array',
    object: 'object',
  };
  const mapped = table[s];
  if (mapped && (PROPERTY_DATA_TYPES as readonly string[]).includes(mapped)) return { data_type: mapped, defaulted_reason: null };
  return { data_type: 'string', defaulted_reason: `unknown data type "${cellText(v)}", defaulted to string` };
}

const FORMAT_TABLE: Array<[RegExp, string]> = [
  [/^e\.?164( format)?$/, 'e164_phone'],
  [/^iso ?4217/, 'currency_code'],
  [/^iso ?3166-?1/, 'country_code'],
  [/^url$|^uri$/, 'uri'],
  [/^(unix|epoch) ?(timestamp)?( \(?seconds\)?)?$|^unix timestamp/, 'unix_seconds'],
  [/^unix.*milli/, 'unix_milliseconds'],
  [/bcp ?47/, 'language_tag'],
  [/^iso ?639/, 'language_code'],
  [/^title ?case$|^capitalized$/, 'title_case'],
  [/^uuid$/, 'uuid'],
  [/^iso ?8601 ?date ?time|^iso ?8601$/, 'iso8601_datetime'],
  [/^iso ?8601 ?date$/, 'iso8601_date'],
  [/^iana/, 'iana_timezone'],
  [/^email$/, 'email'],
];

/** Redundant words that name the data type itself; dropped silently from the leftover note. */
const FORMAT_NOISE = new Set(['string', 'number', 'boolean', 'timestamp', 'datetime', 'date']);

export interface MappedFormats {
  data_formats: string[];
  /** Free-text hints with no token in the app's list (trimmed, lowercase, integer, ...). */
  leftover: string[];
}

export function mapDataFormats(v: Cell): MappedFormats {
  const text = cellText(v);
  if (!text) return { data_formats: [], leftover: [] };
  const formats: string[] = [];
  const leftover: string[] = [];
  // Split on commas outside parentheses.
  const parts = text.split(/,(?![^(]*\))/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const p = part.toLowerCase();
    const hit = FORMAT_TABLE.find(([re]) => re.test(p));
    if (hit && (PROPERTY_DATA_FORMATS as readonly string[]).includes(hit[1])) {
      if (!formats.includes(hit[1])) formats.push(hit[1]);
    } else if (!FORMAT_NOISE.has(p)) {
      leftover.push(part);
    }
  }
  return { data_formats: formats, leftover };
}

export function mapEventClass(eventType: Cell, name: string): string {
  const t = lower(eventType);
  if (t === 'system') return SDK_EVENT_TYPES.includes(name) ? 'sdk' : 'platform';
  return 'custom';
}

const CLIENT_WEB_EVENTS = ['view_item', 'cart_update', 'view_category', 'checkout'];
const SERVER_API_EVENTS = ['purchase', 'purchase_item', 'consent', 'login', 'registration', 'voucher'];

export function mapImplementationMethod(
  name: string,
  eventClass: string,
  sourceType: Cell
): ImplementationMethod | null {
  if (eventClass === 'sdk') return 'sdk_auto';
  if (CLIENT_WEB_EVENTS.includes(name)) return 'client_web';
  if (SERVER_API_EVENTS.includes(name)) return 'server_api';
  const st = lower(sourceType);
  if (st === 'frontend') return 'client_web';
  if (st === 'backend') return 'server_api';
  return null;
}

/** SOURCE TYPE -> which of the project's two sources apply: `Frontend`, `Backend`, `Frontend / Backend`; TBD -> none. */
export function parseSourceKinds(v: Cell): Array<'frontend' | 'backend'> {
  const s = lower(v);
  if (!s) return [];
  const out: Array<'frontend' | 'backend'> = [];
  if (s.includes('frontend') || s.includes('front-end') || s.includes('front end')) out.push('frontend');
  if (s.includes('backend') || s.includes('back-end') || s.includes('back end')) out.push('backend');
  return out;
}

/**
 * Allowed values named in a description: the first parenthesised list of plain tokens ("(accept, reject)"),
 * else the bullet names ("• add: ..."). A discriminator needs them (D-03).
 */
export function extractAllowedValues(description: string | null): string[] {
  if (!description) return [];
  const paren = /\(([^)]*)\)/.exec(description);
  if (paren) {
    const tokens = paren[1].split(',').map((t) => t.trim());
    if (tokens.length >= 2 && tokens.every((t) => /^[A-Za-z0-9_]{1,40}$/.test(t))) return [...new Set(tokens)];
  }
  const bullets: string[] = [];
  for (const m of description.matchAll(/^\s*[•*-]\s*([A-Za-z0-9_]+)\s*:/gm)) bullets.push(m[1]);
  return [...new Set(bullets)];
}

function exampleValues(v: Cell): string[] | null {
  const t = cellText(v);
  return t === null ? null : [t];
}

function joinNotes(...parts: Array<string | null | undefined>): string | null {
  const out = parts.filter((p): p is string => !!p && p.trim() !== '');
  return out.length ? out.join('\n') : null;
}

// ---------------------------------------------------------------------------
// Parsed sheet shape
// ---------------------------------------------------------------------------

export interface SheetEvent {
  row: number;
  name: string;
  description: string | null;
  owner: string | null;
  page: string | null;
  trigger: string | null;
  identity: string | null;
  purpose: string | null;
  eventType: string | null;
  priority: string | null;
  trackingStatus: string | null;
  sourceType: string | null;
  sourceKinds: Array<'frontend' | 'backend'>;
  reliability: string | null;
  timing: string | null;
}

export interface SheetProperty {
  row: number;
  scope: 'event' | 'customer';
  name: string;
  categoryLabel: string | null;
  description: string | null;
  purpose: string | null;
  pii: boolean | null;
  data_type: string;
  defaultedReason: string | null;
  data_formats: string[];
  formatLeftover: string[];
  example_values: string[] | null;
  property_type: string | null;
  notes: string | null;
  priority: string | null;
  status: string | null;
  /** True when the row came from the "Events & Event Attributes" sheet only (no master row). */
  fromAttributesOnly: boolean;
}

export interface SheetAttribute {
  row: number;
  event: string;
  property: string;
  priority: string | null;
  status: string | null;
  required: boolean;
  description: string | null;
  data_formats: string[];
  example_values: string[] | null;
}

export interface SheetIdentity {
  row: number;
  field: string;
  identity: string | null;
  type: 'hard' | 'soft' | null;
  description: string | null;
  value: string | null;
  trigger: string | null;
  example: string | null;
  owner: string | null;
  source: string | null;
  tracker: string | null;
  priority: string | null;
  status: string | null;
}

export interface SheetCatalogField {
  row: number;
  catalog: string;
  name: string;
  description: string | null;
  purpose: string | null;
  priority: string | null;
  status: string | null;
  searchable: boolean;
  required: boolean;
  data_type: string;
  defaultedReason: string | null;
  dataMapping: string | null;
}

export interface SkippedRow {
  sheet: string;
  row: number | null;
  reason: string;
}

export interface ParsedSheet {
  events: SheetEvent[];
  properties: SheetProperty[];
  customerProperties: SheetProperty[];
  attributes: SheetAttribute[];
  identity: SheetIdentity[];
  catalogFields: SheetCatalogField[];
  dropdowns: Record<string, string[]>;
  skipped: SkippedRow[];
  warnings: string[];
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

function parseProperty(r: TableRow, scope: 'event' | 'customer'): SheetProperty | null {
  const name = cellText(r.get('PROPERTY NAME'));
  if (!name) return null;
  const type = mapDataType(r.get('DATA TYPE'));
  const fmt = mapDataFormats(r.get('DATA FORMAT'));
  const notes = joinNotes(cellText(r.get('NOTES')), fmt.leftover.length ? `Format: ${fmt.leftover.join(', ')}` : null);
  return {
    row: r.row,
    scope,
    name,
    categoryLabel: stripEmoji(cellText(r.get('PROPERTY CATEGORY'))),
    description: cellText(r.get('DESCRIPTION')),
    purpose: cellText(r.get('PURPOSE')),
    pii: cellBool(r.get('PII')),
    data_type: type.data_type,
    defaultedReason: type.defaulted_reason,
    data_formats: fmt.data_formats,
    formatLeftover: fmt.leftover,
    example_values: exampleValues(r.get('EXAMPLE VALUES')),
    property_type: lower(r.get('PROPERTY TYPE')),
    notes,
    priority: mapPriority(r.get('PRIORITY')),
    status: mapEntityStatus(r.get('STATUS')),
    fromAttributesOnly: false,
  };
}

export function parseTrackingSheet(raw: RawSheets): ParsedSheet {
  const out: ParsedSheet = {
    events: [],
    properties: [],
    customerProperties: [],
    attributes: [],
    identity: [],
    catalogFields: [],
    dropdowns: {},
    skipped: [],
    warnings: [],
  };

  // Events
  const eventsGrid = findSheet(raw, SHEET_KEYS.events);
  const eventsTable = eventsGrid && readTable(eventsGrid, ['EVENT NAME', 'EVENT TYPE']);
  if (!eventsTable) out.warnings.push('Sheet "Events" not found (or its header row is missing); no events imported.');
  else {
    const seen = new Set<string>();
    for (const r of eventsTable.rows) {
      const name = cellText(r.get('EVENT NAME'));
      if (!name) continue;
      if (seen.has(name)) {
        out.skipped.push({ sheet: 'Events', row: r.row, reason: `duplicate event "${name}"` });
        continue;
      }
      seen.add(name);
      out.events.push({
        row: r.row,
        name,
        description: cellText(r.get('DESCRIPTION')),
        owner: cellText(r.get('OWNER')),
        page: cellText(r.get('PAGE')),
        trigger: cellText(r.get('TRIGGER')),
        identity: cellText(r.get('IDENTITY')),
        purpose: cellText(r.get('PURPOSE')),
        eventType: lower(r.get('EVENT TYPE')),
        priority: mapPriority(r.get('PRIORITY')),
        trackingStatus: mapEventStatus(r.get('TRACKING STATUS')),
        sourceType: cellText(r.get('SOURCE TYPE')),
        sourceKinds: parseSourceKinds(r.get('SOURCE TYPE')),
        reliability: cellText(r.get('RELIABILITY')),
        timing: cellText(r.get('TIMING')),
      });
    }
  }

  // Properties (master)
  const propsGrid = findSheet(raw, SHEET_KEYS.properties);
  const propsTable = propsGrid && readTable(propsGrid, ['PROPERTY NAME', 'DATA TYPE', 'PRESENCE']);
  if (!propsTable) out.warnings.push('Sheet "Properties" not found; event properties come from "Events & Event Attributes" only.');
  else {
    const seen = new Set<string>();
    for (const r of propsTable.rows) {
      const p = parseProperty(r, 'event');
      if (!p) continue;
      if (seen.has(p.name)) {
        out.skipped.push({ sheet: 'Properties', row: r.row, reason: `duplicate property "${p.name}"` });
        continue;
      }
      seen.add(p.name);
      out.properties.push(p);
    }
  }

  // Customer properties
  const custGrid = findSheet(raw, SHEET_KEYS.customerProperties);
  const custTable = custGrid && readTable(custGrid, ['PROPERTY NAME', 'DATA TYPE', 'STATUS']);
  if (!custTable) out.warnings.push('Sheet "Customer Properties" not found; no customer properties imported.');
  else {
    const seen = new Set<string>();
    for (const r of custTable.rows) {
      const p = parseProperty(r, 'customer');
      if (!p) continue;
      if (seen.has(p.name)) {
        out.skipped.push({ sheet: 'Customer Properties', row: r.row, reason: `duplicate property "${p.name}"` });
        continue;
      }
      seen.add(p.name);
      out.customerProperties.push(p);
    }
  }

  // Events & Event Attributes
  const attrGrid = findSheet(raw, SHEET_KEYS.attributes);
  const attrTable = attrGrid && readTable(attrGrid, ['EVENT_NAME', 'PROPERTY_NAME']);
  if (!attrTable) out.warnings.push('Sheet "Events & Event Attributes" not found; no event property links imported.');
  else {
    const masterByName = new Map(out.properties.map((p) => [p.name, p]));
    const seen = new Set<string>();
    const headerCells = (attrGrid![attrTable.headerRow - 1] ?? []).map(normHeader);
    const ci = (h: string) => headerCells.indexOf(h);
    for (const r of attrTable.rows) {
      const event = cellText(r.get('EVENT_NAME'));
      const property = cellText(r.get('PROPERTY_NAME'));
      if (!event || !property) continue;
      if (property.startsWith('✏️') || property.startsWith('✏')) {
        out.skipped.push({ sheet: 'Events & Event Attributes', row: r.row, reason: 'summary row' });
        continue;
      }
      const key = `${event}/${property}`;
      if (seen.has(key)) {
        out.skipped.push({ sheet: 'Events & Event Attributes', row: r.row, reason: `duplicate link ${key}` });
        continue;
      }
      seen.add(key);
      // Rows of the SDK events carry one extra boolean column before DATA TYPE (no DATA FORMAT): data type and example move right.
      const typeIdx = ci('DATA TYPE');
      const shifted = typeof r.get('DATA TYPE') === 'boolean';
      const dataTypeCell = shifted ? r.cells[typeIdx + 1] : r.get('DATA TYPE');
      const formatCell = shifted ? null : r.get('DATA FORMAT');
      const exampleCell = shifted ? r.cells[typeIdx + 2] : r.get('EXAMPLE');
      const piiCell = r.get('PII');
      const rowFormats = mapDataFormats(formatCell);
      out.attributes.push({
        row: r.row,
        event,
        property,
        priority: mapPriority(r.get('PRIORITY')),
        status: mapEntityStatus(r.get('STATUS')),
        required: cellBool(r.get('REQUIRED')) === true,
        description: cellText(r.get('DESCRIPTION')),
        data_formats: rowFormats.data_formats,
        example_values: exampleValues(exampleCell),
      });
      if (!masterByName.has(property)) {
        const type = mapDataType(dataTypeCell);
        const fmt = mapDataFormats(formatCell);
        const prop: SheetProperty = {
          row: r.row,
          scope: 'event',
          name: property,
          categoryLabel: stripEmoji(cellText(r.get('PROPERTY_CATEGORY'))),
          description: cellText(r.get('DESCRIPTION')),
          purpose: null,
          pii: cellBool(piiCell),
          data_type: type.data_type,
          defaultedReason: type.defaulted_reason,
          data_formats: fmt.data_formats,
          formatLeftover: fmt.leftover,
          example_values: exampleValues(exampleCell),
          property_type: 'custom',
          notes: fmt.leftover.length ? `Format: ${fmt.leftover.join(', ')}` : null,
          priority: null,
          status: null,
          fromAttributesOnly: true,
        };
        masterByName.set(property, prop);
      }
    }
    for (const p of masterByName.values()) if (p.fromAttributesOnly) out.properties.push(p);
  }

  // Identity
  const idGrid = findSheet(raw, SHEET_KEYS.identity);
  const idTable = idGrid && readTable(idGrid, ['FIELD IN BLOOMREACH', 'TYPE']);
  if (!idTable) out.warnings.push('Sheet "Identity" not found; no identity rules imported.');
  else {
    for (const r of idTable.rows) {
      const field = cellText(r.get('FIELD IN BLOOMREACH'));
      if (!field) continue;
      const t = lower(r.get('TYPE'));
      out.identity.push({
        row: r.row,
        field,
        identity: cellText(r.get('IDENTITY')),
        type: t?.startsWith('hard') ? 'hard' : t?.startsWith('soft') ? 'soft' : null,
        description: cellText(r.get('DESCRIPTION')),
        value: cellText(r.get('VALUE')),
        trigger: cellText(r.get('TRIGGER')),
        example: cellText(r.get('EXAMPLE')),
        owner: cellText(r.get('OWNER')),
        source: cellText(r.get('SOURCE')),
        tracker: cellText(r.get('TRACKER')),
        priority: mapPriority(r.get('PRIORITY')),
        status: mapEntityStatus(r.get('STATUS')),
      });
    }
  }

  // Catalogs
  const catGrid = findSheet(raw, SHEET_KEYS.catalogs);
  const catTable = catGrid && readTable(catGrid, ['CATALOG NAME', 'PROPERTY NAME (BLOOMREACH)', 'IS SEARCHABLE?']);
  if (!catTable) out.warnings.push('Sheet "Catalogs" not found; no catalogs imported.');
  else {
    const seen = new Set<string>();
    for (const r of catTable.rows) {
      const catalog = cellText(r.get('CATALOG NAME'));
      const name = cellText(r.get('PROPERTY NAME (BLOOMREACH)'));
      if (!catalog && !name) continue;
      if (!catalog || !name || /\(\d+\)\s*$/.test(name) || /catalog$/i.test(catalog)) {
        out.skipped.push({ sheet: 'Catalogs', row: r.row, reason: 'group header row' });
        continue;
      }
      const key = `${catalog}/${name}`;
      if (seen.has(key)) {
        out.skipped.push({ sheet: 'Catalogs', row: r.row, reason: `duplicate field ${key}` });
        continue;
      }
      seen.add(key);
      const type = mapDataType(r.get('DATA TYPE'));
      out.catalogFields.push({
        row: r.row,
        catalog,
        name,
        description: cellText(r.get('DESCRIPTION')),
        purpose: cellText(r.get('PURPOSE')),
        priority: mapPriority(r.get('PRIORITY')),
        status: mapEntityStatus(r.get('STATUS')),
        searchable: cellBool(r.get('IS SEARCHABLE?')) === true,
        required: cellBool(r.get('REQUIRED')) === true,
        data_type: type.data_type,
        defaultedReason: type.defaulted_reason,
        dataMapping: cellText(r.get('DATA MAPPING')),
      });
    }
  }

  // Dropdowns (value lists, one per column)
  const ddGrid = findSheet(raw, SHEET_KEYS.dropdowns);
  if (!ddGrid) out.warnings.push('Sheet "Dropdowns" not found; value lists are not checked.');
  else {
    const header = ddGrid[0] ?? [];
    header.forEach((h, ci) => {
      const name = stripEmoji(cellText(h));
      if (!name) return;
      const values: string[] = [];
      for (let r = 1; r < ddGrid.length; r++) {
        const v = cellText(ddGrid[r]?.[ci]);
        if (v !== null) values.push(v);
      }
      out.dropdowns[name.toUpperCase()] = values;
    });
  }

  // Report the unusable cells the mappers had to default.
  for (const c of out.catalogFields) {
    if (c.defaultedReason) out.skipped.push({ sheet: 'Catalogs', row: c.row, reason: `${c.catalog}/${c.name}: ${c.defaultedReason}` });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Existing state (fetched through the REST API) and the plan
// ---------------------------------------------------------------------------

export interface ExistingSource {
  id: string;
  name: string;
  system?: string | null;
  method?: string | null;
}
export interface ExistingDefinition {
  id: string;
  name: string;
  description?: string | null;
  formats_json?: unknown;
  example_values_json?: unknown;
  allowed_values_json?: unknown;
  [field: string]: unknown;
}
export interface ExistingProperty {
  id: string;
  scope: 'event' | 'customer';
  name: string;
  /** The property's named definitions (D-58), fetched per property by the CLI. */
  definitions?: ExistingDefinition[];
  [field: string]: unknown;
}
export interface ExistingLink {
  property_id: string;
  required: boolean;
  role: string;
  priority: string | null;
  status: string | null;
  definition_id?: string | null;
}
export interface ExistingEvent {
  id: string;
  name: string;
  source_ids: string[];
  links: ExistingLink[];
  [field: string]: unknown;
}
export interface ExistingCatalogField {
  id: string;
  name: string;
  [field: string]: unknown;
}
export interface ExistingCatalog {
  id: string;
  name: string;
  fields: ExistingCatalogField[];
  [field: string]: unknown;
}
export interface ExistingIdentityRule {
  id: string;
  identifier_name: string;
  [field: string]: unknown;
}
export interface ExistingState {
  project: { id: string; key: string; industry: string | null };
  sources: ExistingSource[];
  properties: ExistingProperty[];
  events: ExistingEvent[];
  catalogs: ExistingCatalog[];
  identityRules: ExistingIdentityRule[];
}

export type EntityKind =
  | 'project'
  | 'property'
  | 'property_definition'
  | 'event'
  | 'event_property'
  | 'catalog'
  | 'catalog_field'
  | 'property_catalog_link'
  | 'identity_rule';

export const ENTITY_ORDER: EntityKind[] = [
  'project',
  'property',
  'property_definition',
  'event',
  'event_property',
  'catalog',
  'catalog_field',
  'property_catalog_link',
  'identity_rule',
];

export type PlanAction = 'create' | 'update' | 'unchanged' | 'skipped';

export interface Conflict {
  field: string;
  existing: unknown;
  desired: unknown;
  /** True when the existing value is the column schema default (overwritten only with fillDefaults). */
  default?: boolean;
}

export interface PlanOp {
  entity: EntityKind;
  /** Natural key: name, `event/property`, `catalog/field`, identifier name. */
  key: string;
  action: PlanAction;
  /** Full body for a create (names, not ids, in the reference fields). */
  body?: Record<string, unknown>;
  /** Fields to fill on an existing row. */
  patch?: Record<string, unknown>;
  /** Existing row id for an update. */
  existingId?: string;
  conflicts: Conflict[];
  notes: string[];
  reason?: string;
  needsClientInput?: boolean;
}

export interface NeedsClientInput {
  entity: EntityKind;
  key: string;
  why: string;
}

export interface Plan {
  ops: PlanOp[];
  summary: Record<EntityKind, { create: number; update: number; unchanged: number; skipped: number }>;
  conflicts: Array<Conflict & { entity: EntityKind; key: string }>;
  skipped: Array<{ entity: EntityKind | string; key: string; reason: string }>;
  needsClientInput: NeedsClientInput[];
  /** Named definitions to create, per property (D-58): per-event text that differs from the general definition. */
  definitionsByProperty: Record<string, string[]>;
  warnings: string[];
}

// ---- Fill-empty diff -------------------------------------------------------

export function isEmptyValue(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'boolean') return v === false;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.keys(v as object).length === 0;
  return false;
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'string' && typeof b === 'string') {
    // Emoji prefixes of category labels never count as a difference.
    return (stripEmoji(a) ?? a).replace(/\s+/g, ' ').trim().toLowerCase() === (stripEmoji(b) ?? b).replace(/\s+/g, ' ').trim().toLowerCase();
  }
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface FillDiff {
  patch: Record<string, unknown>;
  conflicts: Conflict[];
}

/**
 * Fill-empty diff: for each non-empty desired field, patch it when the existing value is empty
 * (null, empty text, empty list; a false flag), keep it when equal, and report a conflict when it
 * differs. A difference where the existing value is the column's schema default (`defaults`) is a
 * conflict flagged `default: true`; only with `fillDefaults` is it overwritten. A value somebody set
 * is never changed.
 */
export function diffFillEmpty(
  existing: Record<string, unknown>,
  desired: Record<string, unknown>,
  defaults: Record<string, unknown[]> = {},
  fillDefaults = false
): FillDiff {
  const patch: Record<string, unknown> = {};
  const conflicts: Conflict[] = [];
  for (const [field, want] of Object.entries(desired)) {
    if (want === undefined || want === null) continue;
    if (typeof want !== 'boolean' && isEmptyValue(want)) continue;
    if (want === false) continue; // false is the empty value of a flag; nothing to fill
    const have = existing[field];
    if (sameValue(have, want)) continue;
    if (isEmptyValue(have)) {
      patch[field] = want;
      continue;
    }
    const isDefault = (defaults[field] ?? []).some((d) => sameValue(d, have));
    if (isDefault && fillDefaults) patch[field] = want;
    else conflicts.push(isDefault ? { field, existing: have, desired: want, default: true } : { field, existing: have, desired: want });
  }
  return { patch, conflicts };
}

function opFromDiff(
  fillDefaults: boolean,
  entity: EntityKind,
  key: string,
  existingRow: { id: string } | undefined,
  body: Record<string, unknown>,
  desiredForDiff: Record<string, unknown>,
  defaults: Record<string, unknown[]>,
  notes: string[] = []
): PlanOp {
  if (!existingRow) return { entity, key, action: 'create', body, conflicts: [], notes };
  const { patch, conflicts } = diffFillEmpty(existingRow as unknown as Record<string, unknown>, desiredForDiff, defaults, fillDefaults);
  const action: PlanAction = Object.keys(patch).length ? 'update' : 'unchanged';
  return { entity, key, action, patch: action === 'update' ? patch : undefined, existingId: existingRow.id, conflicts, notes };
}

// ---- Sources ---------------------------------------------------------------

export interface ResolvedSources {
  frontend: ExistingSource | null;
  backend: ExistingSource | null;
  warnings: string[];
}

export function resolveProjectSources(sources: ExistingSource[]): ResolvedSources {
  const warnings: string[] = [];
  const score = (s: ExistingSource, kind: 'frontend' | 'backend'): number => {
    const n = s.name.toLowerCase();
    let sc = 0;
    if (kind === 'frontend') {
      if (/front|web|browser|client|js|gtm/.test(n)) sc += 3;
      if (s.method === 'web_sdk_gtm_datalayer' || s.method === 'web_sdk_direct') sc += 2;
    } else {
      if (/back|server|api|crm|erp/.test(n)) sc += 3;
      if (s.method === 'tracking_api') sc += 2;
      if (s.system === 'custom_backend') sc += 1;
    }
    return sc;
  };
  const best = (kind: 'frontend' | 'backend', exclude?: ExistingSource | null) => {
    const ranked = sources
      .filter((s) => s !== exclude)
      .map((s) => ({ s, sc: score(s, kind) }))
      .filter((x) => x.sc > 0)
      .sort((a, b) => b.sc - a.sc);
    return ranked[0]?.s ?? null;
  };
  const frontend = best('frontend');
  const backend = best('backend', frontend);
  if (!frontend) warnings.push('No frontend source found in the project; events and identity rules are not linked to a frontend source.');
  if (!backend) warnings.push('No backend source found in the project; events are not linked to a backend source.');
  return { frontend, backend, warnings };
}

// ---- Names used by the planner ----------------------------------------------

/**
 * Per-client import profile (`--profile <path>` JSON); the generic code carries no client specifics.
 * - extra_events: events the client has not defined yet; created thin (sheet fields only, status planned,
 *   no property links from the attribute sheet) and listed as "needs client input". `class` and
 *   `implementation_method` are used for the ones the Events sheet does not list.
 * - attach_properties: event -> property names (from the Properties master) linked to that event.
 * - industry: set on the project when it is empty.
 * - discriminators: event -> property whose link is a discriminator (D-03).
 */
export interface ImportProfile {
  extra_events?: Array<{ name: string; class?: string; implementation_method?: string }>;
  attach_properties?: Record<string, string[]>;
  industry?: string;
  discriminators?: Record<string, string>;
}

export interface PlanOptions {
  profile?: ImportProfile;
  /** Overwrite schema-default values (status planned, class custom, ...) instead of listing them as conflicts. */
  fillDefaults?: boolean;
}

const PROPERTY_DEFAULTS: Record<string, unknown[]> = { property_type: ['custom'], status: ['planned'] };

function propertyBody(p: SheetProperty): Record<string, unknown> {
  const body: Record<string, unknown> = {
    scope: p.scope,
    name: p.name,
    data_type: p.data_type,
    pii: p.pii === true,
  };
  // Only the Properties master carries a PROPERTY TYPE; customer rows leave it to the app default.
  if (p.property_type) body.property_type = p.property_type === 'system' ? 'system' : 'custom';
  if (p.description) body.description = p.description;
  if (p.categoryLabel) body.category = p.categoryLabel;
  if (p.notes) body.notes = joinNotes(p.purpose ? `Purpose: ${p.purpose}` : null, p.notes);
  else if (p.purpose) body.notes = `Purpose: ${p.purpose}`;
  if (p.data_formats.length) body.data_formats_json = p.data_formats;
  if (p.example_values) body.example_values_json = p.example_values;
  if (p.priority) body.priority = p.priority;
  if (p.status) body.status = p.status;
  if (p.scope === 'customer' && !SYSTEM_CUSTOMER_PROPERTIES.some((s) => s.name === p.name)) {
    body.category_override = 'customer';
  }
  return body;
}

/** The "id of the item" companion properties a catalog kind needs (D-61 amendment). */
const COMPANION_PROPERTY: Record<string, { name: string; description: string }> = {
  product: { name: 'product_id', description: 'Catalog id of the product; looks up into the products catalog.' },
  variant: { name: 'variant_id', description: 'Catalog id of the variant; looks up into the variants catalog.' },
};

function catalogKindOf(name: string): 'product' | 'variant' | 'other' {
  const n = name.toLowerCase();
  if (n.startsWith('product')) return 'product';
  if (n.startsWith('variant')) return 'variant';
  return 'other';
}

// ---------------------------------------------------------------------------
// The planner
// ---------------------------------------------------------------------------

export function planTrackingSheetImport(parsed: ParsedSheet, existing: ExistingState, opts: PlanOptions = {}): Plan {
  const profile = opts.profile ?? {};
  const fd = opts.fillDefaults === true;
  const discLinks: Array<[string, string]> = Object.entries(profile.discriminators ?? {});
  const isDiscLink = (event: string, property: string) => discLinks.some(([e, p]) => e === event && p === property);
  const ops: PlanOp[] = [];
  const warnings = [...parsed.warnings];
  const needs: NeedsClientInput[] = [];
  const sheetEntity: Record<string, string> = {
    Events: 'event',
    Properties: 'property',
    'Customer Properties': 'property',
    'Events & Event Attributes': 'event_property',
    Catalogs: 'catalog_field',
  };
  const skipped: Plan['skipped'] = parsed.skipped.map((s) => ({ entity: sheetEntity[s.sheet] ?? s.sheet, key: `${s.sheet} row ${s.row ?? '-'}`, reason: s.reason }));

  const sources = resolveProjectSources(existing.sources);
  warnings.push(...sources.warnings);

  const propByKey = new Map(existing.properties.map((p) => [`${p.scope}:${p.name}`, p]));
  const eventByName = new Map(existing.events.map((e) => [e.name, e]));

  // ---- project industry
  const industry = profile.industry;
  if (!industry) {
    // no profile industry: leave the project alone
  } else if (isEmptyValue(existing.project.industry)) {
    ops.push({ entity: 'project', key: existing.project.key, action: 'update', patch: { industry }, existingId: existing.project.id, conflicts: [], notes: [] });
  } else if (existing.project.industry !== industry) {
    ops.push({
      entity: 'project',
      key: existing.project.key,
      action: 'unchanged',
      conflicts: [{ field: 'industry', existing: existing.project.industry, desired: industry }],
      notes: [],
    });
  } else {
    ops.push({ entity: 'project', key: existing.project.key, action: 'unchanged', conflicts: [], notes: [] });
  }

  // ---- properties (event scope from master + attribute-only; customer scope)
  const desiredProps: SheetProperty[] = [...parsed.properties, ...parsed.customerProperties];
  // The companion id properties of product/variant catalogs must exist (D-61).
  const catalogNames = [...new Set(parsed.catalogFields.map((f) => f.catalog))];
  const wantsCompanion = new Set<string>();
  for (const c of catalogNames) {
    const kind = catalogKindOf(c);
    if (kind !== 'other') wantsCompanion.add(kind);
  }
  for (const kind of wantsCompanion) {
    const comp = COMPANION_PROPERTY[kind];
    const has = desiredProps.some((p) => p.scope === 'event' && p.name === comp.name) || propByKey.has(`event:${comp.name}`);
    if (!has) {
      desiredProps.push({
        row: 0, scope: 'event', name: comp.name, categoryLabel: null, description: comp.description, purpose: null, pii: false,
        data_type: 'string', defaultedReason: null, data_formats: [], formatLeftover: [], example_values: null, property_type: 'custom',
        notes: null, priority: null, status: null, fromAttributesOnly: true,
      });
    }
  }
  // Discriminator links need an enum property (D-03): the union of the values each event's description names.
  const discriminatorValues = new Map<string, string[]>();
  for (const a of parsed.attributes) {
    if (!isDiscLink(a.event, a.property)) continue;
    const vals = extractAllowedValues(a.description);
    discriminatorValues.set(a.property, [...new Set([...(discriminatorValues.get(a.property) ?? []), ...vals])]);
  }
  for (const p of desiredProps) {
    const ex = propByKey.get(`${p.scope}:${p.name}`);
    const body = propertyBody(p);
    if (p.scope === 'event' && (discriminatorValues.get(p.name)?.length ?? 0) > 0) body.allowed_values_json = discriminatorValues.get(p.name)!.map((value) => ({ value }));
    ops.push(opFromDiff(fd, 'property', `${p.scope}:${p.name}`, ex, body, body, PROPERTY_DEFAULTS, p.defaultedReason ? [p.defaultedReason] : []));
    if (p.defaultedReason) skipped.push({ entity: 'property', key: `${p.scope}:${p.name}`, reason: p.defaultedReason });
  }

  const propBodyByName = new Map<string, Record<string, unknown>>();
  for (const p of desiredProps) if (p.scope === 'event') propBodyByName.set(p.name, propertyBody(p));

  // ---- events
  const sheetEventNames = new Set(parsed.events.map((e) => e.name));
  const extraEvents = profile.extra_events ?? [];
  const airline = new Set<string>(extraEvents.map((x) => x.name));
  for (const e of parsed.events) {
    const eventClass = mapEventClass(e.eventType, e.name);
    if (eventClass === 'custom' && classifyEventType(e.name) !== 'custom') {
      warnings.push(`Event "${e.name}" is typed custom in the sheet but is a Bloomreach ${classifyEventType(e.name)} event name; class kept custom as in the sheet.`);
    }
    if (e.eventType === 'system' && !SDK_EVENT_TYPES.includes(e.name) && !PLATFORM_EVENT_TYPES.includes(e.name)) {
      warnings.push(`Event "${e.name}" is typed system but not in the known Bloomreach lists; class set to platform.`);
    }
    const sourceIds: string[] = [];
    for (const k of e.sourceKinds) {
      const s = k === 'frontend' ? sources.frontend : sources.backend;
      if (s) sourceIds.push(s.id);
    }
    const isAirline = airline.has(e.name);
    const method = mapImplementationMethod(e.name, eventClass, e.sourceType);
    const extraSpec = extraEvents.find((x) => x.name === e.name);
    const body: Record<string, unknown> = { name: e.name, class: eventClass };
    const set = (k: string, v: unknown) => {
      if (v !== null && v !== undefined && !(typeof v === 'string' && v === '')) body[k] = v;
    };
    set('description', e.description);
    set('purpose', e.purpose);
    set('page', e.page);
    set('trigger_text', e.trigger);
    set('identity_note', e.identity ? `Identity: ${e.identity}` : null);
    set('owner_business', e.owner);
    set('priority', e.priority);
    body.status = isAirline ? 'planned' : (e.trackingStatus ?? 'planned');
    if (!isAirline) set('implementation_method', method);
    else set('implementation_method', extraSpec?.implementation_method);
    if (sourceIds.length) body.source_ids = sourceIds;
    const ex = eventByName.get(e.name);
    const diffDesired: Record<string, unknown> = { ...body };
    delete diffDesired.name;
    if (ex) {
      // source_ids: fill only when the event has none.
      if (ex.source_ids.length > 0) delete diffDesired.source_ids;
    }
    const op = opFromDiff(fd, 'event', e.name, ex, body, diffDesired, {
      status: ['planned'],
      implementation_method: ['client_web'],
      class: ['custom'],
    });
    if (isAirline) {
      op.needsClientInput = true;
      op.notes.push('extra event: sheet fields only; properties await client input');
      needs.push({ entity: 'event', key: e.name, why: 'definition and properties to be confirmed by the client' });
    }
    if (e.sourceKinds.length === 0 && !isAirline && e.eventType !== 'system') {
      needs.push({ entity: 'event', key: e.name, why: `SOURCE TYPE is ${e.sourceType ?? 'empty'}; no source linked` });
    }
    ops.push(op);
  }
  // Extra events the Events sheet does not list (their own tab only): created thin, class from the profile or the Bloomreach lists.
  for (const x of extraEvents) {
    const a = x.name;
    if (sheetEventNames.has(a) || parsed.events.length === 0) continue;
    const body: Record<string, unknown> = { name: a, class: x.class ?? classifyEventType(a), status: 'planned' };
    if (x.implementation_method) body.implementation_method = x.implementation_method;
    const ex = eventByName.get(a);
    const diffDesired = { ...body };
    delete diffDesired.name;
    const op = opFromDiff(fd, 'event', a, ex, body, diffDesired, { status: ['planned'], class: ['custom'], implementation_method: ['client_web'] });
    op.needsClientInput = true;
    op.notes.push('extra event not in the Events sheet: name only; definition awaits client input');
    needs.push({ entity: 'event', key: a, why: 'not in the Events sheet: definition and properties to be provided by the client' });
    ops.push(op);
  }

  // ---- event property links
  const knownEvent = (name: string) => sheetEventNames.has(name) || eventByName.has(name);
  const knownProperty = (name: string) => desiredProps.some((p) => p.scope === 'event' && p.name === name) || propByKey.has(`event:${name}`);
  const linkDesired = new Map<string, { event: string; property: string; required: boolean; role?: string; priority: string | null; status: string | null; attr?: SheetAttribute; definition?: string }>();
  for (const a of parsed.attributes) {
    if (airline.has(a.event)) continue;
    if (!knownEvent(a.event)) {
      skipped.push({ entity: 'event_property', key: `${a.event}/${a.property}`, reason: `event "${a.event}" is not in the Events sheet or the project` });
      continue;
    }
    let isDisc = isDiscLink(a.event, a.property);
    if (isDisc && (discriminatorValues.get(a.property)?.length ?? 0) === 0) {
      isDisc = false;
      needs.push({ entity: 'event_property', key: `${a.event}/${a.property}`, why: 'discriminator, but no allowed values could be read from the description; linked as a normal property' });
    }
    linkDesired.set(`${a.event}/${a.property}`, {
      event: a.event, property: a.property, required: a.required, role: isDisc ? 'discriminator' : undefined, priority: a.priority, status: a.status, attr: a,
    });
  }
  const masterNames = new Set(parsed.properties.map((p) => p.name));
  for (const [event, names] of Object.entries(profile.attach_properties ?? {})) {
    if (!knownEvent(event) && !airline.has(event)) continue;
    for (const pn of names) {
      if (!masterNames.has(pn) && !propByKey.has(`event:${pn}`)) {
        skipped.push({ entity: 'event_property', key: `${event}/${pn}`, reason: 'property not in the Properties master' });
        continue;
      }
      linkDesired.set(`${event}/${pn}`, { event, property: pn, required: false, priority: null, status: null });
    }
  }
  for (const [key, l] of linkDesired) {
    if (!knownProperty(l.property)) {
      skipped.push({ entity: 'event_property', key, reason: `property "${l.property}" unknown` });
      continue;
    }
    const exEvent = eventByName.get(l.event);
    const exProp = propByKey.get(`event:${l.property}`);
    // D-58: per-event text that differs from the general definition becomes a definition named after the event.
    let exDef: ExistingDefinition | undefined;
    if (l.attr) {
      const exGeneral = exProp?.definitions?.find((d) => d.name === 'general');
      const pb = propBodyByName.get(l.property) ?? {};
      const asValues = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => (x && typeof x === 'object' ? String((x as { value?: unknown }).value) : String(x))) : []);
      const gen = exGeneral
        ? { description: exGeneral.description ?? null, formats: asValues(exGeneral.formats_json), example: asValues(exGeneral.example_values_json), allowed: asValues(exGeneral.allowed_values_json) }
        : { description: (pb.description as string | undefined) ?? null, formats: asValues(pb.data_formats_json), example: asValues(pb.example_values_json), allowed: asValues(pb.allowed_values_json) };
      const rowAllowed = extractAllowedValues(l.attr.description);
      const same = (a: string[], b: string[]) => JSON.stringify(a) === JSON.stringify(b);
      const differs =
        (!!l.attr.description && !sameValue(gen.description ?? '', l.attr.description)) ||
        (l.attr.data_formats.length > 0 && !same(l.attr.data_formats, gen.formats)) ||
        (!!l.attr.example_values && !same(l.attr.example_values, gen.example)) ||
        (rowAllowed.length > 0 && !same(rowAllowed, gen.allowed));
      if (differs) {
        const formats = l.attr.data_formats.length ? l.attr.data_formats : gen.formats;
        const example = l.attr.example_values ?? gen.example;
        const defBody: Record<string, unknown> = { property: l.property, name: l.event };
        const description = l.attr.description ?? gen.description;
        if (description) defBody.description = description;
        if (formats.length) defBody.formats_json = formats;
        if (example.length) defBody.example_values_json = example;
        if (rowAllowed.length) defBody.allowed_values_json = rowAllowed.map((value) => ({ value }));
        exDef = exProp?.definitions?.find((d) => d.name === l.event);
        const diffDesired = { ...defBody };
        delete diffDesired.property;
        delete diffDesired.name;
        ops.push(opFromDiff(fd, 'property_definition', `${l.property}/${l.event}`, exDef, defBody, diffDesired, {}));
        l.definition = l.event;
      }
    }
    const exLink = exEvent && exProp ? exEvent.links.find((x) => x.property_id === exProp.id) : undefined;
    const body: Record<string, unknown> = { event: l.event, property: l.property, required: l.required };
    if (l.role) body.role = l.role;
    if (l.priority) body.priority = l.priority;
    if (l.status) body.status = l.status;
    if (l.definition) body.definition = l.definition;
    if (!exLink) {
      ops.push({ entity: 'event_property', key, action: 'create', body, conflicts: [], notes: [] });
    } else {
      const desired: Record<string, unknown> = { required: l.required, role: l.role, priority: l.priority, status: l.status };
      const { patch, conflicts } = diffFillEmpty(exLink as unknown as Record<string, unknown>, desired, { role: ['normal'], status: ['planned'] }, fd);
      if (l.definition) {
        const generalId = exProp?.definitions?.find((d) => d.name === 'general')?.id;
        const cur = exLink.definition_id ?? null;
        if (exDef && cur === exDef.id) {
          // already on the named definition
        } else if (!cur || cur === generalId) patch.definition = l.definition;
        else conflicts.push({ field: 'definition_id', existing: cur, desired: exDef?.id ?? l.definition });
      }
      ops.push({
        entity: 'event_property', key, action: Object.keys(patch).length ? 'update' : 'unchanged',
        patch: Object.keys(patch).length ? patch : undefined, body: { event: l.event, property: l.property }, conflicts, notes: [],
      });
    }
  }

  // ---- catalogs and fields
  const fieldsByCatalog = new Map<string, SheetCatalogField[]>();
  for (const f of parsed.catalogFields) {
    const l = fieldsByCatalog.get(f.catalog) ?? [];
    l.push(f);
    fieldsByCatalog.set(f.catalog, l);
  }
  const catalogByName = new Map(existing.catalogs.map((c) => [c.name, c]));
  const lookupFieldOf = new Map<string, string>(); // catalog name -> lookup key field name
  for (const [cname, fields] of fieldsByCatalog) {
    const kind = catalogKindOf(cname);
    const cbody: Record<string, unknown> = {
      name: cname, kind, version: 'v1',
      description: kind === 'product' ? 'Product catalog (imported from the legacy tracking sheet).' : kind === 'variant' ? 'Variant catalog (imported from the legacy tracking sheet).' : null,
      status: 'planned',
    };
    if (cbody.description === null) delete cbody.description;
    const exc = catalogByName.get(cname);
    const cdiff = { ...cbody };
    delete cdiff.name;
    ops.push(opFromDiff(fd, 'catalog', cname, exc, cbody, cdiff, { kind: ['other'], version: ['v1'], status: ['planned'] }));

    // Fields: sheet rows, plus the D-61 lookup key (item_id) and the id companion field.
    const desiredFields: Array<Record<string, unknown> & { name: string }> = [];
    for (const f of fields) {
      const fb: Record<string, unknown> & { name: string } = { name: f.name, data_type: f.data_type };
      if (f.description) fb.description = f.description;
      if (f.purpose) fb.purpose = f.purpose;
      if (f.priority) fb.priority = f.priority;
      if (f.status) fb.status = f.status;
      if (f.searchable) fb.is_searchable = true;
      if (f.required) fb.is_required = true;
      if (f.dataMapping) fb.client_field_name = f.dataMapping;
      desiredFields.push(fb);
    }
    if (kind !== 'other') {
      const comp = COMPANION_PROPERTY[kind];
      if (!desiredFields.some((d) => d.name === 'item_id')) {
        desiredFields.unshift({
          name: 'item_id', data_type: 'string', is_lookup_key: true, is_required: true, bloomreach_column: 'item_id',
          description: 'The lookup key (Bloomreach item_id); Jinja cannot read it.',
        });
      } else {
        const d = desiredFields.find((x) => x.name === 'item_id')!;
        d.is_lookup_key = true;
      }
      if (!desiredFields.some((d) => d.name === comp.name)) {
        desiredFields.push({ name: comp.name, data_type: 'string', is_required: true, description: `Same value as item_id, readable in Jinja. Matches ${comp.name} on events.` });
      }
      lookupFieldOf.set(cname, 'item_id');
    }
    const exFields = new Map((exc?.fields ?? []).map((f) => [f.name, f]));
    for (const fb of desiredFields) {
      const ef = exFields.get(fb.name);
      const diffDesired = { ...fb };
      delete diffDesired.name;
      const op = opFromDiff(fd, 'catalog_field', `${cname}/${fb.name}`, ef, { ...fb, catalog: cname }, diffDesired, { status: ['planned'], data_type: ['string'] });
      const src = fields.find((f) => f.name === fb.name);
      if (src?.defaultedReason) {
        op.notes.push(src.defaultedReason);
        op.needsClientInput = true;
        needs.push({ entity: 'catalog_field', key: `${cname}/${fb.name}`, why: src.defaultedReason });
      }
      ops.push(op);
    }
  }

  // ---- property -> catalog lookup links (D-61): product_id -> products.item_id, variant_id -> variants.item_id
  for (const [cname] of fieldsByCatalog) {
    const kind = catalogKindOf(cname);
    if (kind === 'other') continue;
    const comp = COMPANION_PROPERTY[kind];
    const exProp = propByKey.get(`event:${comp.name}`);
    const exCat = catalogByName.get(cname);
    const exField = exCat?.fields.find((f) => f.name === 'item_id');
    const body = { property: comp.name, catalog: cname, field: 'item_id' };
    if (exProp && exCat && exField) {
      if (exProp.mapped_catalog_id === exCat.id && exProp.mapped_catalog_field_id === exField.id) {
        ops.push({ entity: 'property_catalog_link', key: comp.name, action: 'unchanged', body, conflicts: [], notes: [] });
        continue;
      }
      if (!isEmptyValue(exProp.mapped_catalog_id)) {
        ops.push({
          entity: 'property_catalog_link', key: comp.name, action: 'unchanged', body,
          conflicts: [{ field: 'mapped_catalog_id', existing: exProp.mapped_catalog_id, desired: exCat.id }], notes: [],
        });
        continue;
      }
      ops.push({ entity: 'property_catalog_link', key: comp.name, action: 'update', body, existingId: exProp.id, conflicts: [], notes: [] });
    } else {
      ops.push({ entity: 'property_catalog_link', key: comp.name, action: 'create', body, conflicts: [], notes: [] });
    }
  }

  // ---- identity rules
  const eventNamesLower = new Map<string, string>();
  for (const n of [...sheetEventNames, ...eventByName.keys()]) eventNamesLower.set(n.toLowerCase().replace(/[\s-]+/g, '_'), n);
  const ruleByIdent = new Map(existing.identityRules.map((r) => [r.identifier_name, r]));
  for (const r of parsed.identity) {
    if (!r.type) {
      skipped.push({ entity: 'identity_rule', key: r.field, reason: `TYPE "${r.type ?? 'empty'}" is neither Hard ID nor Soft ID` });
      continue;
    }
    const body: Record<string, unknown> = { identifier_name: r.field, name: r.identity ?? r.field, identity_type: r.type };
    const set = (k: string, v: unknown) => {
      if (v !== null && v !== undefined && v !== '') body[k] = v;
    };
    set('description', r.description);
    set('value_rule', r.value);
    set('example', r.example);
    set('owner', r.owner);
    set('tracker', r.tracker);
    set('priority', r.priority);
    set('status', r.status);
    if (r.trigger) {
      const match = eventNamesLower.get(r.trigger.toLowerCase().replace(/[\s-]+/g, '_'));
      if (match) body.trigger_event = match;
      else body.trigger_text = r.trigger;
    }
    const src = r.source?.toLowerCase() ?? '';
    // A cookie, or a JS SDK / GTM / frontend source, is set by the frontend; only a hard id is an identify call.
    if (r.field === 'cookie' || /js sdk|javascript|web sdk|gtm|frontend|front-end/.test(src)) {
      if (sources.frontend) body.source_id = sources.frontend.id;
      if (r.type === 'hard') body.sdk_call = 'identify';
    }
    const ex = ruleByIdent.get(r.field);
    const diffDesired = { ...body };
    delete diffDesired.identifier_name;
    delete diffDesired.trigger_event;
    ops.push(opFromDiff(fd, 'identity_rule', r.field, ex, body, diffDesired, { status: ['planned'] }));
  }

  return finishPlan(ops, skipped, needs, warnings);
}

function finishPlan(ops: PlanOp[], skipped: Plan['skipped'], needs: NeedsClientInput[], warnings: string[]): Plan {
  const summary = Object.fromEntries(
    ENTITY_ORDER.map((e) => [e, { create: 0, update: 0, unchanged: 0, skipped: 0 }])
  ) as Plan['summary'];
  const conflicts: Plan['conflicts'] = [];
  for (const op of ops) {
    summary[op.entity][op.action]++;
    for (const c of op.conflicts) conflicts.push({ ...c, entity: op.entity, key: op.key });
  }
  for (const s of skipped) {
    const e = s.entity as EntityKind;
    if (summary[e]) summary[e].skipped++;
  }
  ops.sort((a, b) => ENTITY_ORDER.indexOf(a.entity) - ENTITY_ORDER.indexOf(b.entity));
  const definitionsByProperty: Record<string, string[]> = {};
  for (const op of ops) {
    if (op.entity !== 'property_definition' || op.action !== 'create') continue;
    const prop = String(op.body?.property);
    (definitionsByProperty[prop] ??= []).push(String(op.body?.name));
  }
  return { ops, summary, conflicts, skipped, needsClientInput: needs, definitionsByProperty, warnings };
}

/** Plain-text preview of a plan (the dry-run output). */
export function formatPlan(plan: Plan): string {
  const lines: string[] = [];
  lines.push('entity                   create  update  unchanged  skipped');
  for (const e of ENTITY_ORDER) {
    const s = plan.summary[e];
    lines.push(`${e.padEnd(24)} ${String(s.create).padStart(6)}  ${String(s.update).padStart(6)}  ${String(s.unchanged).padStart(9)}  ${String(s.skipped).padStart(7)}`);
  }
  lines.push('');
  const defProps = Object.entries(plan.definitionsByProperty);
  lines.push(`definitions created per property: ${defProps.reduce((n, [, v]) => n + v.length, 0)} on ${defProps.length} properties`);
  for (const [prop, names] of defProps) lines.push(`  ${prop}: ${names.join(', ')}`);
  lines.push('');
  lines.push(`conflicts: ${plan.conflicts.length}`);
  for (const c of plan.conflicts.slice(0, 40)) lines.push(`  ${c.entity} ${c.key}: ${c.field} existing=${JSON.stringify(c.existing)} sheet=${JSON.stringify(c.desired)}`);
  lines.push(`skipped rows: ${plan.skipped.length}`);
  for (const s of plan.skipped.slice(0, 40)) lines.push(`  ${s.entity} ${s.key}: ${s.reason}`);
  lines.push(`needs client input: ${plan.needsClientInput.length}`);
  for (const n of plan.needsClientInput.slice(0, 40)) lines.push(`  ${n.entity} ${n.key}: ${n.why}`);
  if (plan.warnings.length) {
    lines.push(`warnings: ${plan.warnings.length}`);
    for (const w of plan.warnings) lines.push(`  ${w}`);
  }
  return lines.join('\n');
}

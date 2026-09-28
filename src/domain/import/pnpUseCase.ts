/**
 * Converter for the Bloomreach Use Case Center's own export format (`pnp_usecase`, D-59): turns one
 * such document -- or an array of them, or each wrapped in `{data: {...}, success: true}` (the
 * literal shape of `.claude/team/samples/br-pnp/*.json`) -- into `e3-use-case-library` v1
 * templates (`src/domain/import/useCaseLibrary.ts#LibraryTemplate`). Pure, no DB/Express import
 * (domain-model skill); strict-but-forgiving like every other Bloomreach parser: a malformed piece
 * becomes a warning and is dropped or noted, never a thrown exception.
 *
 * Mapping (D-59, verbatim from the decision):
 *  - `mapped_event` -> a `standard_event` requirement (`target_kind: 'event'`).
 *  - `event` -> one requirement per `properties[]` entry (`target_kind: 'event_property'`, level R
 *    unless `property.is_optional` or the requirement's own `is_optional`); a property whose
 *    `property_constraint` is `{operator: 'equals', operands: [{type: 'constant', value}]}` becomes
 *    a `target_kind: 'variant'` requirement with `condition: {property_name, value}` instead (the
 *    property itself *is* the discriminator, e.g. `purchase[purchase_status=success]`) -- any other
 *    operator is kept as an ordinary `event_property` requirement, with a warning and a
 *    `prerequisites` note (the operator cannot be expressed as a variant condition here).
 *  - `consent` -> one `target_kind: 'consent'` requirement per `properties[]` entry, keyed by the
 *    constraint's value (`property_name` on the requirement is the constant, e.g. `newsletter`) --
 *    a `consent` property without an `equals` constant constraint is skipped with a warning (nothing
 *    to key it by).
 *  - `customer_property` -> one `target_kind: 'customer_property'` requirement per `properties[]`
 *    entry.
 *  - `catalog` -> one `target_kind: 'catalog_attribute'` requirement per `fields[]` entry
 *    (`field_name`), same optional-level rule as `event`.
 *  - `main_catalog`, every `*_integration` type, and `text` -> a `prerequisites[]` note on the
 *    template (new optional field, never a resolvable requirement).
 *  - any other `requirements[].type` -> a warning and a `prerequisites` note ("unhandled
 *    requirement type"), never dropped silently.
 *  - `fulfillments[]` -> `expected_assets[]` (`{type: item_reference.type, headline}`).
 *  - `usecase_tags` -> `tags.tiers` (minus `popular`, which becomes `flags.popular`); `goal` ->
 *    `tags.goals` (`analyse_data` normalised to `analyze_data`); `kpis`/`channels`/`industries` ->
 *    the matching tag list, dashes normalised to underscores; unknown vocabulary is kept with a
 *    warning (D-57 policy), never dropped.
 *  - `template_id` -> `code` (upper-cased); `name`, `description` (from the pnp document's own
 *    `description`, one level above `template`), `documentation_link` -> `documentation_url`;
 *    `{kind: 'pnp_usecase', template_id, documentation_link, callout}` -> `source`.
 *  - every template is `type: 'marketing'` (the Use Case Center has no transactional/marketing
 *    split of its own; every pnp_usecase export is a marketing use case in this app's sense).
 */
import type { LibraryTemplate, LibraryRequirement, LibraryExpectedAsset } from './useCaseLibrary';
import { isKnownStandardEvent, getStandardEventFields } from '../bloomreach';

// ----- pnp_usecase raw shape (loose -- only the fields this converter reads) -----

interface PnpOperand {
  type?: string;
  value?: unknown;
}

interface PnpConstraint {
  operator?: string;
  type?: string;
  operands?: PnpOperand[];
}

interface PnpProperty {
  property_name?: string;
  property_type?: string;
  is_optional?: boolean;
  property_constraint?: PnpConstraint | null;
}

interface PnpField {
  field_name?: string;
  field_type?: string;
  is_optional?: boolean;
  field_constraint?: PnpConstraint | null;
}

interface PnpRequirement {
  type?: string;
  is_optional?: boolean;
  event_name?: string;
  properties?: PnpProperty[];
  fields?: PnpField[];
  catalog_name?: string;
  name?: string;
  items?: string[];
  categories?: { name?: string; items?: string[] }[];
}

interface PnpFulfillment {
  headline?: string;
  description?: string;
  item_reference?: { type?: string; id?: string };
}

interface PnpTemplate {
  type?: string;
  callout?: string;
  channels?: string[];
  documentation_link?: string;
  fulfillments?: PnpFulfillment[];
  goal?: string;
  industries?: string[];
  kpis?: string[];
  requirements?: PnpRequirement[];
  usecase_tags?: string[];
}

interface PnpDocument {
  name?: string;
  description?: string;
  template?: PnpTemplate;
  template_id?: string;
}

export interface PnpConvertResult {
  templates: LibraryTemplate[];
  warnings: string[];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * True when `json` looks like a pnp_usecase document (bare, `{data: {...}}`-wrapped, or an array of
 * either) -- used by `useCaseLibraryImport.service.ts` to decide whether to convert before parsing
 * as the native library format. Never throws.
 */
export function isPnpUseCaseDocument(json: unknown): boolean {
  const check = (doc: unknown): boolean => {
    const inner = isPlainObject(doc) && isPlainObject(doc.data) ? doc.data : doc;
    return isPlainObject(inner) && isPlainObject(inner.template) && inner.template.type === 'pnp_usecase';
  };
  if (Array.isArray(json)) return json.length > 0 && json.some(check);
  return check(json);
}

/**
 * D-59 fix round (ERROR 3): true when a document (or one item of an array) looks like a pnp_usecase
 * submission attempt -- it names a `template_id` -- but `template` itself is present and not a
 * plain object (e.g. a string, number or array). This is distinct from "not detected as pnp at
 * all" (`isPnpUseCaseDocument` false, silently falls back to the native library format and warns
 * `templates must be an array`): the route uses this to reject the request outright with 400
 * rather than accepting it as a confusing zero-item preview.
 */
export function isMalformedPnpAttempt(json: unknown): boolean {
  const check = (item: unknown): boolean => {
    const inner = isPlainObject(item) && isPlainObject(item.data) ? item.data : item;
    if (!isPlainObject(inner)) return false;
    if (typeof inner.template_id !== 'string' || !inner.template_id.trim()) return false;
    return inner.template !== undefined && !isPlainObject(inner.template);
  };
  if (Array.isArray(json)) return json.some(check);
  return check(json);
}

const INTEGRATION_LABELS: Record<string, string> = {
  email_integration: 'an email integration',
  sms_integration: 'an SMS integration',
  mms_integration: 'an MMS integration',
  browser_notification_integration: 'a browser push integration',
  mobile_notification_integration: 'a mobile push integration',
};

/** dash/space -> underscore, lower-cased; the shared normalisation for every tag list (D-59). */
function toSnake(token: string): string {
  return token.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

const GOAL_ALIASES: Record<string, string> = { analyse_data: 'analyze_data', retention: 'increase_retention' };
/** D-59: pnp_usecase corpus abbreviations aligned onto `LIBRARY_KPIS`' spelled-out tokens. */
const KPI_ALIASES: Record<string, string> = { aov: 'average_order_value', rpv: 'revenue_per_visitor' };
/** D-59: pnp_usecase's "*_notification" channel tokens aligned onto `LIBRARY_CHANNELS`. */
const CHANNEL_ALIASES: Record<string, string> = {
  browser_push_notification: 'browser_push',
  mobile_push_notification: 'mobile_push',
};

function normalizeTagList(values: unknown, aliases: Record<string, string> = {}): string[] {
  if (!Array.isArray(values)) return [];
  const out: string[] = [];
  for (const v of values) {
    if (typeof v !== 'string' || !v.trim()) continue;
    const s = toSnake(v);
    out.push(aliases[s] ?? s);
  }
  return out;
}

/** Single-value `equals` constraint -> its constant string value, else `null` (not that shape). */
function equalsConstant(constraint: PnpConstraint | null | undefined): string | null {
  if (!constraint || constraint.operator !== 'equals') return null;
  const operands = constraint.operands ?? [];
  if (operands.length !== 1) return null;
  const value = operands[0]?.value;
  if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') return null;
  return String(value);
}

function levelFor(requirementOptional: boolean | undefined, propertyOptional: boolean | undefined): string {
  return requirementOptional || propertyOptional ? 'O' : 'R';
}

/**
 * D-59 fix round (reviewer FAIL 2026-09-28 17:12, ERROR 3): every array-typed field on a pnp
 * document is attacker/author-controlled JSON, not a TypeScript-checked shape -- a string, number
 * or plain object where an array is expected must never throw (`(value ?? []).forEach`/`for...of`
 * throws on a non-iterable, and a string is iterable by character, silently producing garbage
 * instead of the warning the "never throws" contract promises). Non-array, non-nullish input
 * becomes a warning and an empty array; `null`/`undefined` is silently empty (nothing to warn
 * about -- the field was simply omitted).
 */
/**
 * D-59 fix round (WARNING 7, D-59 amendment 3): the corpus names the cart event `cart_update`
 * (Bloomreach's own default event name), not the standard-event catalog key `add_to_cart` --
 * literal-name resolution alone (D-55 step 2) then misses a project whose mapping renames it. This
 * maps it onto the closest standard event: `add_to_cart` by default, `remove_from_cart` when a
 * sibling `action` property carries an `equals` constraint of `remove`. `event_name` is always kept
 * too (the caller still sets it), so the exact-name fallback still works for a project with no
 * matching standard event mapping.
 */
function standardEventFor(eventName: string, properties: PnpProperty[]): string | undefined {
  if (eventName === 'cart_update') {
    const isRemove = properties.some(
      (p) => p.property_name === 'action' && equalsConstant(p.property_constraint) === 'remove'
    );
    return isRemove ? 'remove_from_cart' : 'add_to_cart';
  }
  return isKnownStandardEvent(eventName) ? eventName : undefined;
}

function asArray<T>(value: unknown, path: string, warnings: string[]): T[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) {
    warnings.push(`${path} must be an array; treated as empty.`);
    return [];
  }
  return value as T[];
}

interface ConvertCtx {
  requirements: LibraryRequirement[];
  prerequisites: string[];
  warnings: string[];
  templateCode: string;
}

function pushRequirement(ctx: ConvertCtx, req: LibraryRequirement): void {
  ctx.requirements.push(req);
}

function convertEventRequirement(ctx: ConvertCtx, req: PnpRequirement, index: number): void {
  const eventName = req.event_name?.trim();
  if (!eventName) {
    ctx.warnings.push(`${ctx.templateCode}.requirements[${index}] (type "event") is missing event_name; skipped.`);
    return;
  }
  const properties = asArray<PnpProperty>(req.properties, `${ctx.templateCode}.requirements[${index}].properties`, ctx.warnings);
  const standardEvent = standardEventFor(eventName, properties);
  const standardFields = standardEvent ? getStandardEventFields(standardEvent) : undefined;
  if (properties.length === 0) {
    // An event requirement with no properties still names an event to require.
    pushRequirement(ctx, { target_kind: 'event', event_name: eventName, standard_event: standardEvent, level: levelFor(req.is_optional, false) });
    return;
  }
  for (const prop of properties) {
    const propertyName = prop.property_name?.trim();
    if (!propertyName) {
      ctx.warnings.push(`${ctx.templateCode}.requirements[${index}] has a property with no property_name; skipped.`);
      continue;
    }
    const level = levelFor(req.is_optional, prop.is_optional);
    // D-55: `standard_event` is only carried onto a property-scoped requirement when the property
    // is actually one of that standard event's own Bloomreach fields -- `useCaseLibrary.ts`'s own
    // parser otherwise warns that the mapping step can never resolve it (INFO 4). A property that is
    // *not* a standard field still gets `event_name` (exact-name resolution still works), just not
    // the standard-event mapping shortcut.
    const propertyStandardEvent = standardFields?.includes(propertyName) ? standardEvent : undefined;
    const constant = equalsConstant(prop.property_constraint);
    if (constant !== null) {
      pushRequirement(ctx, {
        target_kind: 'variant',
        event_name: eventName,
        standard_event: standardEvent,
        condition: { property_name: propertyName, value: constant },
        level,
      });
      continue;
    }
    if (prop.property_constraint) {
      ctx.warnings.push(
        `${ctx.templateCode}.requirements[${index}].properties (event "${eventName}", property "${propertyName}") has a property_constraint with operator "${String(prop.property_constraint.operator)}", which cannot be expressed as a variant condition; kept as a plain property requirement.`
      );
      ctx.prerequisites.push(
        `${eventName}.${propertyName} must additionally satisfy "${String(prop.property_constraint.operator)}" (not modelled as a variant here; verify manually).`
      );
    }
    pushRequirement(ctx, {
      target_kind: 'event_property',
      event_name: eventName,
      standard_event: propertyStandardEvent,
      property_name: propertyName,
      level,
    });
  }
}

function convertConsentRequirement(ctx: ConvertCtx, req: PnpRequirement, index: number): void {
  for (const prop of asArray<PnpProperty>(req.properties, `${ctx.templateCode}.requirements[${index}].properties`, ctx.warnings)) {
    const constant = equalsConstant(prop.property_constraint);
    if (constant === null) {
      ctx.warnings.push(`${ctx.templateCode}.requirements[${index}] (type "consent") has no equals constant constraint; skipped.`);
      continue;
    }
    pushRequirement(ctx, {
      target_kind: 'consent',
      property_name: constant,
      level: levelFor(req.is_optional, prop.is_optional),
    });
  }
}

function convertCustomerPropertyRequirement(ctx: ConvertCtx, req: PnpRequirement, index: number): void {
  for (const prop of asArray<PnpProperty>(req.properties, `${ctx.templateCode}.requirements[${index}].properties`, ctx.warnings)) {
    const propertyName = prop.property_name?.trim();
    if (!propertyName) {
      ctx.warnings.push(`${ctx.templateCode}.requirements[${index}] (type "customer_property") has a property with no property_name; skipped.`);
      continue;
    }
    pushRequirement(ctx, {
      target_kind: 'customer_property',
      property_name: propertyName,
      level: levelFor(req.is_optional, prop.is_optional),
    });
  }
}

function convertCatalogRequirement(ctx: ConvertCtx, req: PnpRequirement, index: number): void {
  for (const field of asArray<PnpField>(req.fields, `${ctx.templateCode}.requirements[${index}].fields`, ctx.warnings)) {
    const fieldName = field.field_name?.trim();
    if (!fieldName) {
      ctx.warnings.push(`${ctx.templateCode}.requirements[${index}] (type "catalog") has a field with no field_name; skipped.`);
      continue;
    }
    pushRequirement(ctx, {
      target_kind: 'catalog_attribute',
      field_name: fieldName,
      level: levelFor(req.is_optional, field.is_optional),
    });
  }
  if (req.catalog_name) ctx.prerequisites.push(`Catalog "${req.catalog_name}" is expected to be the project's main catalog.`);
}

function convertTextRequirement(ctx: ConvertCtx, req: PnpRequirement): void {
  const parts: string[] = [];
  if (req.name) parts.push(req.name.trim());
  for (const cat of asArray<{ name?: string; items?: string[] }>(req.categories, `${ctx.templateCode}.requirements.categories`, ctx.warnings)) {
    const items = asArray<string>(cat.items, `${ctx.templateCode}.requirements.categories.items`, ctx.warnings)
      .filter((i) => typeof i === 'string' && i.trim())
      .map((i) => i.trim());
    if (cat.name || items.length > 0) parts.push([cat.name?.trim(), ...items].filter(Boolean).join(': '));
  }
  for (const item of asArray<string>(req.items, `${ctx.templateCode}.requirements.items`, ctx.warnings)) {
    if (typeof item === 'string' && item.trim()) parts.push(item.trim());
  }
  if (parts.length > 0) ctx.prerequisites.push(parts.join(' — '));
}

function convertRequirement(ctx: ConvertCtx, req: PnpRequirement, index: number): void {
  switch (req.type) {
    case 'mapped_event': {
      const eventName = req.event_name?.trim();
      if (!eventName) {
        ctx.warnings.push(`${ctx.templateCode}.requirements[${index}] (type "mapped_event") is missing event_name; skipped.`);
        return;
      }
      const standardEvent = standardEventFor(eventName, []);
      pushRequirement(ctx, {
        target_kind: 'event',
        event_name: eventName,
        standard_event: standardEvent,
        level: levelFor(req.is_optional, false),
      });
      return;
    }
    case 'event':
      convertEventRequirement(ctx, req, index);
      return;
    case 'consent':
      convertConsentRequirement(ctx, req, index);
      return;
    case 'customer_property':
      convertCustomerPropertyRequirement(ctx, req, index);
      return;
    case 'catalog':
      convertCatalogRequirement(ctx, req, index);
      return;
    case 'text':
      convertTextRequirement(ctx, req);
      return;
    case 'main_catalog':
      ctx.prerequisites.push('Requires the project\'s main catalog to be configured.');
      return;
    default: {
      if (req.type && req.type in INTEGRATION_LABELS) {
        ctx.prerequisites.push(`Requires ${INTEGRATION_LABELS[req.type]} configured in Bloomreach.`);
        return;
      }
      ctx.warnings.push(`${ctx.templateCode}.requirements[${index}] has an unhandled requirement type "${String(req.type)}"; noted as a prerequisite.`);
      ctx.prerequisites.push(`Unhandled requirement type "${String(req.type)}"; verify manually.`);
    }
  }
}

function convertFulfillments(fulfillments: unknown, templateCode: string, warnings: string[]): LibraryExpectedAsset[] {
  const out: LibraryExpectedAsset[] = [];
  for (const f of asArray<PnpFulfillment>(fulfillments, `${templateCode}.fulfillments`, warnings)) {
    const headline = f.headline?.trim();
    if (!headline) continue;
    out.push({ type: f.item_reference?.type?.trim() || 'other', headline });
  }
  return out;
}

function convertOne(doc: PnpDocument, warnings: string[]): LibraryTemplate | null {
  const t: PnpTemplate | undefined = doc.template;
  if (!t || typeof t !== 'object') {
    warnings.push('A pnp_usecase document is missing "template"; skipped.');
    return null;
  }
  const rawCode = doc.template_id?.trim();
  if (!rawCode) {
    warnings.push('A pnp_usecase document is missing "template_id"; skipped.');
    return null;
  }
  const code = rawCode.toUpperCase();
  const name = doc.name?.trim() || rawCode;

  const ctx: ConvertCtx = { requirements: [], prerequisites: [], warnings, templateCode: code };
  asArray<PnpRequirement>(t.requirements, `${code}.requirements`, warnings).forEach((req, index) =>
    convertRequirement(ctx, req, index)
  );

  const usecaseTags = asArray<string>(t.usecase_tags, `${code}.usecase_tags`, warnings);
  const tags = {
    channels: normalizeTagList(t.channels, CHANNEL_ALIASES),
    goals: normalizeTagList(t.goal ? [t.goal] : [], GOAL_ALIASES),
    tiers: normalizeTagList(usecaseTags.filter((tag) => tag !== 'popular')),
    kpis: normalizeTagList(t.kpis, KPI_ALIASES),
    industries: normalizeTagList(t.industries),
  };
  const flags = { new: false, popular: usecaseTags.includes('popular') };

  return {
    code,
    name,
    type: 'marketing',
    description: doc.description?.trim() || null,
    narrative_template: null,
    tags,
    flags,
    default_requirements: ctx.requirements,
    prerequisites: ctx.prerequisites,
    expected_assets: convertFulfillments(t.fulfillments, code, warnings),
    source: {
      kind: 'pnp_usecase',
      template_id: rawCode,
      ...(t.documentation_link ? { documentation_link: t.documentation_link } : {}),
      ...(t.callout ? { callout: t.callout } : {}),
    },
    documentation_url: t.documentation_link?.trim() || null,
    internal_notes: null,
    internal_url: null,
  };
}

/** Unwraps one `{data: {...}, success: true}` item (or the bare document), pure pass-through otherwise. */
function unwrap(item: unknown): PnpDocument {
  if (isPlainObject(item) && isPlainObject(item.data)) return item.data as PnpDocument;
  return (item ?? {}) as PnpDocument;
}

/**
 * Converts one pnp_usecase document, a `{data: {...}}` wrapper, or an array of either, into
 * `e3-use-case-library` templates. Never throws; a malformed document is skipped with a warning, the
 * rest of the array still converts. Duplicate `template_id`s (case-insensitive) keep the first.
 */
export function convertPnpUseCases(json: unknown): PnpConvertResult {
  const warnings: string[] = [];
  const items = Array.isArray(json) ? json : [json];
  const seen = new Set<string>();
  const templates: LibraryTemplate[] = [];
  for (const item of items) {
    const doc = unwrap(item);
    const template = convertOne(doc, warnings);
    if (!template) continue;
    if (seen.has(template.code)) {
      warnings.push(`Duplicate template_id "${template.code}" (case-insensitive); the first occurrence is kept.`);
      continue;
    }
    seen.add(template.code);
    templates.push(template);
  }
  return { templates, warnings };
}

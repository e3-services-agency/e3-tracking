/**
 * Catalog checks and property-to-catalog alignment (D-61, T-4-11B), comparison id `catalogs`. Pure
 * function, no DB/Express import; `comparison.service.ts` loads the catalogs with their fields plus
 * the project's properties and feeds them in. Needs no observations.
 *
 * Catalog checks (per catalog):
 * - `catalog_searchable_limit`: warning at 40 searchable fields (the Bloomreach limit), error above.
 * - `catalog_searchable_changed` (error): a v1 catalog marked live whose searchable set differs from
 *   the snapshot taken when it went live (on v1 the set is fixed in advance).
 * - `catalog_lookup_key` (error): no lookup key field, or more than one.
 * - `catalog_lookup_property` (error, D-61 amendment): the lookup key field is the item_id column, which Jinja
 *   cannot read; every catalog with a lookup key needs a regular non-key field with the same value, named
 *   like the key's `client_field_name` or else `product_id` / `variant_id` for the kind.
 *
 * Across catalogs of one kind (product, variant; `other` catalogs are not compared):
 * - `catalog_schema_drift` (warning): a field present in some markets and missing in others, or a
 *   field whose data type or searchable flag differs between them. One finding per kind and field.
 *
 * Alignment:
 * - `catalog_type_mismatch` (error): a property linked to a catalog field with a different data type.
 * - `catalog_link_missing` (warning): an event property named like a catalog id (`product_id`,
 *   `item_id`, `variant_id`) that is not linked to the lookup key of a catalog of the matching kind.
 */
import { CATALOG_SEARCHABLE_LIMIT, type CatalogKind, type CatalogVersion, type ComparisonId } from '../enums';
import type { EngineFinding } from './definitionVsObservations';
import { catalogMarketLabel } from '../catalogs';

export interface CatalogCheckField {
  id: string;
  name: string;
  data_type: string | null;
  is_lookup_key: boolean;
  is_searchable: boolean;
  client_field_name: string | null;
  bloomreach_column: string | null;
}

export interface CatalogCheckCatalog {
  id: string;
  name: string;
  kind: CatalogKind;
  market: string | null;
  language: string | null;
  version: CatalogVersion;
  live_at: string | null;
  searchable_snapshot: string[] | null;
  fields: CatalogCheckField[];
}

export interface CatalogCheckProperty {
  id: string;
  name: string;
  scope: string;
  data_type: string;
  mapped_catalog_id: string | null;
  mapped_catalog_field_id: string | null;
}

export interface CatalogCheckInput {
  catalogs: CatalogCheckCatalog[];
  properties: CatalogCheckProperty[];
}

const COMPARISON: ComparisonId = 'catalogs';

/** Event property names that denote a catalog id, and the catalog kind each one looks up into. */
export const CATALOG_ID_PROPERTY_KINDS: Readonly<Record<string, CatalogKind>> = {
  product_id: 'product',
  item_id: 'product',
  variant_id: 'variant',
};

/** The property name a kind's id is conventionally given (used to find the Jinja-readable copy of a key). */
const KIND_ID_NAME: Partial<Record<CatalogKind, string>> = { product: 'product_id', variant: 'variant_id' };

/**
 * Coarse type families so a catalog field type (Bloomreach vocabulary: string, long text, number,
 * boolean, list, json, date ...) can be compared with a property data type (`PROPERTY_DATA_TYPES`).
 * `null` = unknown vocabulary, never flagged.
 */
export function typeFamily(dataType: string | null | undefined): string | null {
  const t = (dataType ?? '').trim().toLowerCase();
  if (!t) return null;
  if (['string', 'text', 'long text', 'long_text', 'url', 'html'].includes(t)) return 'string';
  if (['number', 'int', 'integer', 'long', 'double', 'float', 'decimal', 'money'].includes(t)) return 'number';
  if (['boolean', 'bool'].includes(t)) return 'boolean';
  if (['list', 'array'].includes(t)) return 'array';
  if (['json', 'object', 'map'].includes(t)) return 'object';
  if (['date', 'datetime', 'timestamp'].includes(t)) return 'timestamp';
  return null;
}

function fp(kind: EngineFinding['kind'], propertyId: string | null, detail: string): string {
  return [COMPARISON, kind, '', '', propertyId ?? '', detail].join('|');
}

function label(c: CatalogCheckCatalog): string {
  const m = catalogMarketLabel(c.market, c.language);
  return m ? `${c.name} (${m})` : c.name;
}

function finding(
  kind: EngineFinding['kind'],
  severity: EngineFinding['severity'],
  propertyId: string | null,
  detail: string,
  message: string,
  expected: unknown,
  actual: unknown
): EngineFinding {
  return {
    comparison: COMPARISON,
    kind,
    severity,
    event_id: null,
    variant_id: null,
    property_id: propertyId,
    observation_id: null,
    expected_json: expected,
    actual_json: actual,
    message,
    fingerprint: fp(kind, propertyId, detail),
  };
}

export function runCatalogChecks(input: CatalogCheckInput): EngineFinding[] {
  const findings: EngineFinding[] = [];
  const { catalogs, properties } = input;

  for (const c of catalogs) {
    const searchable = c.fields.filter((f) => f.is_searchable).map((f) => f.name).sort();

    // ---- searchable count ----
    if (searchable.length >= CATALOG_SEARCHABLE_LIMIT) {
      const over = searchable.length > CATALOG_SEARCHABLE_LIMIT;
      findings.push(
        finding(
          'catalog_searchable_limit',
          over ? 'error' : 'warning',
          null,
          c.id,
          over
            ? `Catalog "${label(c)}" has ${searchable.length} searchable fields, over the limit of ${CATALOG_SEARCHABLE_LIMIT}.`
            : `Catalog "${label(c)}" has ${searchable.length} searchable fields, the limit of ${CATALOG_SEARCHABLE_LIMIT}.`,
          { catalog_id: c.id, max_searchable: CATALOG_SEARCHABLE_LIMIT },
          { catalog: c.name, searchable_count: searchable.length }
        )
      );
    }

    // ---- v1 searchable set fixed at go-live ----
    if (c.version === 'v1' && c.live_at && c.searchable_snapshot) {
      const snapshot = [...c.searchable_snapshot].sort();
      const added = searchable.filter((n) => !snapshot.includes(n));
      const removed = snapshot.filter((n) => !searchable.includes(n));
      if (added.length > 0 || removed.length > 0) {
        const parts = [
          added.length ? `added ${added.map((n) => `"${n}"`).join(', ')}` : null,
          removed.length ? `removed ${removed.map((n) => `"${n}"`).join(', ')}` : null,
        ].filter(Boolean);
        findings.push(
          finding(
            'catalog_searchable_changed',
            'error',
            null,
            c.id,
            `Catalog "${label(c)}" is live on v1, but its searchable fields changed since go-live (${parts.join('; ')}).`,
            { catalog_id: c.id, searchable: snapshot },
            { catalog: c.name, searchable, added, removed }
          )
        );
      }
    }

    // ---- lookup key present and unique ----
    const keys = c.fields.filter((f) => f.is_lookup_key);
    if (keys.length !== 1) {
      findings.push(
        finding(
          'catalog_lookup_key',
          'error',
          null,
          c.id,
          keys.length === 0
            ? `Catalog "${label(c)}" has no lookup key field.`
            : `Catalog "${label(c)}" has ${keys.length} lookup key fields (${keys.map((k) => `"${k.name}"`).join(', ')}); the key must be unique.`,
          { catalog_id: c.id, lookup_keys: 1 },
          { catalog: c.name, lookup_keys: keys.map((k) => k.name) }
        )
      );
    } else {
      // ---- the lookup key must also be readable as a property (Jinja reads only properties) ----
      const key = keys[0];
      // D-61 amendment: the field flagged as lookup key IS the item_id column, which Jinja cannot read, so a
      // regular non-key field with the same value must exist (kind id name, or the key's client_field_name).
      const wanted = key.client_field_name?.trim() || KIND_ID_NAME[c.kind] || null;
      if (wanted) {
        const hasProperty = c.fields.some((f) => f.id !== key.id && f.name.toLowerCase() === wanted.toLowerCase());
        if (!hasProperty) {
          const keyIsNamedLikeIt = key.name.toLowerCase() === wanted.toLowerCase();
          findings.push(
            finding(
              'catalog_lookup_property',
              'error',
              null,
              c.id,
              keyIsNamedLikeIt
                ? `Catalog "${label(c)}": the lookup key "${key.name}" is the item_id column, which Jinja cannot read; treat this field as item_id (rename it) and add a regular "${wanted}" field with the same value, because Jinja reads only properties.`
                : `Catalog "${label(c)}": the lookup key "${key.name}" is the item_id column, which Jinja cannot read; add a regular field "${wanted}" with the same value, because Jinja reads only properties.`,
              { catalog_id: c.id, property_field: wanted },
              { catalog: c.name, lookup_key: key.name }
            )
          );
        }
      }
    }
  }

  // ---- schema drift across catalogs of the same kind ----
  const byKind = new Map<CatalogKind, CatalogCheckCatalog[]>();
  for (const c of catalogs) {
    if (c.kind === 'other') continue;
    byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), c]);
  }
  for (const [kind, group] of byKind) {
    if (group.length < 2) continue;
    const names = [...new Set(group.flatMap((c) => c.fields.map((f) => f.name)))].sort();
    for (const name of names) {
      const having = group.filter((c) => c.fields.some((f) => f.name === name));
      const missing = group.filter((c) => !c.fields.some((f) => f.name === name));
      if (missing.length > 0) {
        findings.push(
          finding(
            'catalog_schema_drift',
            'warning',
            null,
            `${kind}|${name}|missing`,
            `${kind} catalogs differ: field "${name}" is in ${having.map(label).join(', ')} but missing in ${missing.map(label).join(', ')}.`,
            { kind, field: name, present_in_all: true },
            { present: having.map((c) => c.name), missing: missing.map((c) => c.name) }
          )
        );
      }
      const fields = having.map((c) => ({ catalog: c, field: c.fields.find((f) => f.name === name)! }));
      const types = new Set(fields.map((x) => (x.field.data_type ?? '').toLowerCase()));
      if (types.size > 1) {
        findings.push(
          finding(
            'catalog_schema_drift',
            'warning',
            null,
            `${kind}|${name}|type`,
            `${kind} catalogs differ: field "${name}" has different types (${fields.map((x) => `${label(x.catalog)}: ${x.field.data_type ?? 'unset'}`).join(', ')}).`,
            { kind, field: name, same_type: true },
            { types: Object.fromEntries(fields.map((x) => [x.catalog.name, x.field.data_type])) }
          )
        );
      }
      const searchableFlags = new Set(fields.map((x) => x.field.is_searchable));
      if (searchableFlags.size > 1) {
        findings.push(
          finding(
            'catalog_schema_drift',
            'warning',
            null,
            `${kind}|${name}|searchable`,
            `${kind} catalogs differ: field "${name}" is searchable in ${fields.filter((x) => x.field.is_searchable).map((x) => label(x.catalog)).join(', ')} but not in ${fields.filter((x) => !x.field.is_searchable).map((x) => label(x.catalog)).join(', ')}.`,
            { kind, field: name, same_searchable: true },
            { searchable: Object.fromEntries(fields.map((x) => [x.catalog.name, x.field.is_searchable])) }
          )
        );
      }
    }
  }

  // ---- alignment: linked property type vs catalog field type ----
  const fieldById = new Map<string, { catalog: CatalogCheckCatalog; field: CatalogCheckField }>();
  for (const c of catalogs) for (const f of c.fields) fieldById.set(f.id, { catalog: c, field: f });
  for (const p of properties) {
    if (!p.mapped_catalog_field_id) continue;
    const target = fieldById.get(p.mapped_catalog_field_id);
    if (!target) continue;
    const fieldFamily = typeFamily(target.field.data_type);
    const propFamily = typeFamily(p.data_type);
    if (!fieldFamily || !propFamily || fieldFamily === propFamily) continue;
    findings.push(
      finding(
        'catalog_type_mismatch',
        'error',
        p.id,
        `${target.catalog.id}|${target.field.id}`,
        `Property "${p.name}" is ${p.data_type}, but the catalog field "${target.catalog.name}.${target.field.name}" it is linked to is ${target.field.data_type}.`,
        { catalog_field: `${target.catalog.name}.${target.field.name}`, data_type: target.field.data_type },
        { property: p.name, data_type: p.data_type }
      )
    );
  }

  // ---- alignment: id-named event properties should link to the lookup key of the matching kind ----
  for (const p of properties) {
    if (p.scope !== 'event') continue;
    const kind = CATALOG_ID_PROPERTY_KINDS[p.name];
    if (!kind) continue;
    const kindCatalogs = catalogs.filter((c) => c.kind === kind && c.fields.some((f) => f.is_lookup_key));
    if (kindCatalogs.length === 0) continue;
    const linked = p.mapped_catalog_field_id ? fieldById.get(p.mapped_catalog_field_id) : undefined;
    if (linked && linked.catalog.kind === kind && linked.field.is_lookup_key) continue;
    const example = kindCatalogs[0];
    const key = example.fields.find((f) => f.is_lookup_key)!;
    findings.push(
      finding(
        'catalog_link_missing',
        'warning',
        p.id,
        kind,
        `Property "${p.name}" looks like a ${kind} id, but it is not linked to the lookup key of a ${kind} catalog (for example "${example.name}.${key.name}").`,
        { catalog_field: `${example.name}.${key.name}` },
        { property: p.name, linked: linked ? `${linked.catalog.name}.${linked.field.name}` : null }
      )
    );
  }

  return findings;
}

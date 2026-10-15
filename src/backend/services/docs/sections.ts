/**
 * Pure HTML-fragment renderers for the project documentation export (D-18's
 * `GET /export/documentation.html`). Both functions take already-resolved rows (no DB access) and
 * are covered by `sections.test.ts`. `generateProjectDocumentationHtml` (export.service.ts, wired
 * in during the T-1-06 integration round) calls `renderIdentityRulesSection` and
 * `renderConsentCategoriesSection` alongside the existing property/event sections, resolving
 * `trigger_event_name`/`source_name` from ids before calling in.
 */
import { escapeHtml } from '../htmlEscape';
import { enumLabelOr } from '@/src/domain/enumLabels';
import { formatExampleValues } from '../../../domain/examples';
import { groupFieldMap, mappingHeading } from '../../../domain/document/standardMappings';
import type { FindingsSummaryView } from '../../../domain/document/findingsSummary';
import { FAMILY_INFO, comparisonLabel, comparisonTooltip, kindLabel, kindTooltip } from '../../../domain/findingsCatalog';
import { formatDisplayName, groupPropertiesByCategory, propertyGroupId, propertyKindGroupId, type PropertyCategory } from '../../../domain/propertyCategory';
import type { PropertyKind } from '../../../domain/enums';

export { escapeHtml };

/**
 * Small safe renderer for the exact markdown subset `useCaseNarrative.ts` (D-32) emits: `## `
 * headings, `1. ` numbered lists, `- ` bullet lists, blank-line-separated paragraphs, and
 * `` `code` `` inline spans (WARNING 3 fix round: the narrative used to be dropped into one
 * `<p>` verbatim, so headings/lists/backticks collapsed into a run-on paragraph). Every line is
 * run through `escapeHtml` before any markdown syntax is interpreted, so the output is exactly as
 * safe against injection as the plain-paragraph version it replaces (backticks are not touched by
 * `escapeHtml`, so wrapping `` `x` `` in `<code>` after escaping cannot reintroduce a raw tag).
 * Anything outside this subset (arbitrary HTML, other markdown syntax) is rendered as escaped
 * plain text, not interpreted -- this is not a general markdown parser.
 */
function renderNarrativeInline(text: string): string {
  return escapeHtml(text).replace(/`([^`]+)`/g, '<code>$1</code>');
}

type NarrativeBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'ol'; items: string[] }
  | { kind: 'ul'; items: string[] }
  | { kind: 'p'; text: string };

/**
 * Single shared set of line-type regexes, used identically for *detecting* a line's type and for
 * *excluding* that type from the paragraph collector below (T-2-11 fix round, ERROR 1: the original
 * heading detector was anchored (`/^##\s+(.*)$/`, `.` never matches `\r` and `$` requires end of
 * string) but the paragraph exclusion used the looser, unanchored `/^##\s+/`, which *did* match a
 * CRLF heading line. On a line like `"## Flow\r"` the heading branch failed to match, fell through
 * to the paragraph branch, and the paragraph branch's own exclusion then rejected the very same
 * line, so the while loop at :72 (old line numbers) never consumed it: `paraLines` stayed empty, an
 * empty `p` block was pushed every iteration, and `i` never advanced -- an infinite loop that grows
 * `blocks` until the single-threaded Express process runs out of memory, taking down the whole API
 * for every user on one `GET /export/documentation.html`). Both call sites now use these same three
 * regexes, so a line that matches for exclusion always also matches for detection.
 */
const HEADING_RE = /^##\s+(.*)$/;
const ORDERED_RE = /^\d+\.\s+(.*)$/;
const BULLET_RE = /^-\s+(.*)$/;

/** Normalizes `\r\n` and lone `\r` line endings to `\n` before parsing (same fix round). */
function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n?/g, '\n');
}

function parseNarrativeBlocks(markdown: string): NarrativeBlock[] {
  const lines = normalizeLineEndings(markdown).split('\n');
  const blocks: NarrativeBlock[] = [];
  let i = 0;
  while (i < lines.length) {
    const startIndex = i;
    const line = lines[i];
    if (line.trim() === '') {
      i++;
      continue;
    }
    const heading = HEADING_RE.exec(line);
    if (heading) {
      blocks.push({ kind: 'heading', text: heading[1] });
      i++;
    } else if (ORDERED_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && ORDERED_RE.test(lines[i])) {
        items.push(ORDERED_RE.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ kind: 'ol', items });
    } else if (BULLET_RE.test(line)) {
      const items: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) {
        items.push(BULLET_RE.exec(lines[i])![1]);
        i++;
      }
      blocks.push({ kind: 'ul', items });
    } else {
      // Plain paragraph: consecutive non-blank lines that are not headings/list items, joined with a space.
      const paraLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '' && !HEADING_RE.test(lines[i]) && !ORDERED_RE.test(lines[i]) && !BULLET_RE.test(lines[i])) {
        paraLines.push(lines[i]);
        i++;
      }
      blocks.push({ kind: 'p', text: paraLines.join(' ') });
    }
    // Every branch above must consume at least one line; a loop that doesn't advance `i` would hang
    // the process exactly like the ERROR 1 bug this replaces. Guard it explicitly rather than trust
    // the branches forever.
    if (i === startIndex) {
      throw new Error(`parseNarrativeBlocks: no progress at line ${startIndex} (${JSON.stringify(line)})`);
    }
  }
  return blocks;
}

/** `narrative markdown (D-32 subset) -> HTML fragment`, headings/lists/inline code/paragraphs, fully escaped. */
export function renderNarrativeHtml(markdown: string): string {
  return parseNarrativeBlocks(markdown)
    .map((block) => {
      if (block.kind === 'heading') return `<h5>${renderNarrativeInline(block.text)}</h5>`;
      if (block.kind === 'ol') return `<ol>${block.items.map((item) => `<li>${renderNarrativeInline(item)}</li>`).join('')}</ol>`;
      if (block.kind === 'ul') return `<ul>${block.items.map((item) => `<li>${renderNarrativeInline(item)}</li>`).join('')}</ul>`;
      return `<p>${renderNarrativeInline(block.text)}</p>`;
    })
    .join('\n');
}

/** Minimal shape the identity rules section needs; DAL row plus resolved display names. */
export interface IdentityRuleForDocs {
  identifier_name: string;
  identity_type: string;
  name: string;
  description?: string | null;
  /** Resolved from `trigger_event_id` by the caller (the DAL only stores the id). */
  trigger_event_name?: string | null;
  trigger_text?: string | null;
  value_rule?: string | null;
  example?: string | null;
  owner?: string | null;
  /** Resolved from `source_id` by the caller. */
  source_name?: string | null;
  tracker?: string | null;
  priority?: string | null;
  status?: string | null;
  /** D-38: `IDENTITY_TRANSFORMATIONS` subset. */
  transformations?: string[] | null;
  /** D-38: `IDENTITY_SDK_CALLS`, nullable for a policy-only rule. */
  sdk_call?: string | null;
  /** D-67 (T-4-28): names of the events that send this identifier in `customer_ids`. */
  carried_by?: string[] | null;
}

/** Minimal shape the identity codegen block needs (D-38, `buildIdentityCodegen`'s output). */
import type { IdentityVariants } from '../../../domain/codegen/identity';

export interface IdentityCodegenForDocs {
  identify: IdentityVariants;
  update: IdentityVariants;
  anonymize: IdentityVariants;
}

/** Minimal shape the consent categories section needs; matches `ConsentCategoryRow`. */
export interface ConsentCategoryForDocs {
  name: string;
  description?: string | null;
  standard_key?: string | null;
  status?: string | null;
}

/** Minimal shape the per-event variants subsection needs (T-1-05). */
export interface VariantForDocs {
  name: string;
  description?: string | null;
  /** Already-formatted condition text, e.g. "action = add", built by the caller from conditions_json. */
  conditionsText: string;
  /** The standard event this variant maps to, if any (from StandardEventMapping.variant_id). */
  standard_event?: string | null;
}

/** Minimal shape the "Standard event mappings" section needs (T-1-05). */
export interface StandardEventMappingForDocs {
  standard_event: string;
  event_name: string;
  variant_name?: string | null;
  /** `{bloomreach_field: property_name | payload_key}`, already resolved by the caller. */
  field_map: Record<string, string | null>;
}

/** Minimal shape one requirement row needs for the use case's ordered requirement list (T-1-07). */
export interface RequirementForDocs {
  /** Already-resolved display label for the target, e.g. "purchase.total_price" or "checkout[status=success]". */
  target_label: string;
  level: string;
  status?: string | null;
  note?: string | null;
}

/** Minimal shape the "Use cases" section needs; requirements already in `sort_order` (T-1-07). */
export interface UseCaseForDocs {
  code?: string | null;
  name: string;
  type?: string | null;
  priority?: string | null;
  status?: string | null;
  owner?: string | null;
  description?: string | null;
  narrative?: string | null;
  requirements: RequirementForDocs[];
  /** D-59 amendment 1: additive. `internal_notes`/`internal_url` are deliberately not part of this shape (amendment 2: never in the HTML export). */
  documentation_url?: string | null;
}

/** D-58/T-4-00 follow-up (T-4-03): one named meaning of a customer-scope property
 * (`property_definitions`), matching `TrackingDocumentPropertyDefinition`. */
export interface PropertyDefinitionForDocs {
  name: string;
  description?: string | null;
  allowed_values?: { value: string; label?: string | null }[] | null;
  formats?: string[];
  example_values?: unknown;
}

/** D-58/T-4-00 follow-up (T-4-03): the project-wide "Properties" section needs one row per
 * customer-scope property, each with every named definition it carries -- the HTML export had no
 * per-property definition list before this (only the inline per-event definition on the property
 * table), matching `TrackingDocument.properties[].definitions[]`. */
export interface PropertyForDocs {
  name: string;
  /** D-64 (T-4-20): group in the Properties section; absent = `customer`. */
  category?: PropertyCategory;
  /** D-63 kind, sub-groups the `event` category; absent = `event`. */
  kind?: PropertyKind;
  data_type: string;
  pii?: boolean;
  description?: string | null;
  definitions: PropertyDefinitionForDocs[];
}

/** Minimal shape the computed requirements matrix section needs (T-1-07, CONTEXT.md 3.2). */
export interface RequirementsMatrixForDocs {
  use_cases: { id: string; code: string | null; name: string }[];
  rows: { label: string; cells: Record<string, string | null> }[];
}

function cell(value: string | null | undefined): string {
  const text = value == null || value === '' ? '—' : value;
  return `<td>${escapeHtml(text)}</td>`;
}

/**
 * Renders the "Identity rules" documentation section: one row per rule, ordered as passed in
 * (callers pass `listIdentityRules`'s already sort_order-ordered result).
 */
export interface IdentifierForDocs {
  name: string;
  type: string;
  description?: string | null;
  is_cookie?: boolean;
}

/** D-69: the identifiers registry as two lists, hard ids and soft ids (the cookie is marked). */
function renderIdentifiersBlock(identifiers: IdentifierForDocs[]): string {
  if (identifiers.length === 0) return '';
  const list = (type: string) => {
    const items = identifiers.filter((i) => i.type === type);
    if (items.length === 0) return '<p>None.</p>';
    return `<ul>${items
      .map((i) => `<li><code>${escapeHtml(i.name)}</code>${i.is_cookie ? ' (cookie)' : ''}${i.description ? ` - ${escapeHtml(i.description)}` : ''}</li>`)
      .join('')}</ul>`;
  };
  return `<h3>Identifiers</h3><div class="identifiers"><h4>Hard IDs</h4>${list('hard')}<h4>Soft IDs</h4>${list('soft')}</div>`;
}

export function renderIdentityRulesSection(rules: IdentityRuleForDocs[], identificationFlow?: string | null, identifiers: IdentifierForDocs[] = []): string {
  if (rules.length === 0) {
    return `<section id="identity-rules"><h2>Identity rules</h2>${renderIdentifiersBlock(identifiers)}<p>No identity rules defined.</p></section>`;
  }
  const rows = rules
    .map(
      (rule) => `<tr>
        ${cell(rule.name)}
        ${cell(rule.identifier_name)}
        ${cell(rule.identity_type)}
        ${cell(rule.sdk_call)}
        ${cell(Array.isArray(rule.transformations) && rule.transformations.length > 0 ? rule.transformations.join(', ') : null)}
        ${cell(rule.trigger_event_name)}
        ${cell(rule.trigger_text)}
        ${cell(rule.value_rule)}
        ${cell(rule.example)}
        ${cell(rule.owner)}
        ${cell(rule.source_name)}
        ${cell(rule.tracker)}
        ${cell(enumLabelOr('priority', rule.priority))}
        ${cell(enumLabelOr('status', rule.status))}
        ${cell(Array.isArray(rule.carried_by) && rule.carried_by.length > 0 ? rule.carried_by.join(', ') : null)}
      </tr>`
    )
    .join('\n');
  return `<section id="identity-rules">
    <h2>Identity rules</h2>
    ${renderIdentifiersBlock(identifiers)}
    ${identificationFlow ? `<h3>Identification flow</h3><p class="identification-flow">${escapeHtml(identificationFlow)}</p>` : ''}
    <table>
      <thead>
        <tr>
          <th>Name</th><th>Identifier name</th><th>Identity type</th><th>SDK call</th>
          <th>Transformations</th><th>Trigger event</th>
          <th>Trigger</th><th>Value rule</th><th>Example</th><th>Owner</th><th>Source</th>
          <th>Tracker</th><th>Priority</th><th>Status</th><th>Carried by</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </section>`;
}

/**
 * Renders the "Identity codegen" documentation section (D-38): the three Web SDK snippets
 * `buildIdentityCodegen` produces from the project's identity rules and mapped customer
 * properties, so the migration engineer can copy them straight from the exported HTML.
 */
const IDENTITY_VARIANT_LABELS: [keyof IdentityVariants, string][] = [
  ['gtm_datalayer', 'GTM / dataLayer'],
  ['web_sdk', 'Bloomreach Web SDK'],
  ['web_sdk_legacy', 'Bloomreach Web SDK (legacy)'],
  ['tracking_api', 'Bloomreach Tracking API'],
];

export function renderIdentityCodegenSection(snippets: IdentityCodegenForDocs): string {
  const block = (name: 'identify' | 'update' | 'anonymize') => `<div>
        <h3>${name}</h3>
        ${IDENTITY_VARIANT_LABELS.filter(([key]) => snippets[name][key].trim())
          .map(([key, label]) => `<div class="codegen-snippet"><h4>${escapeHtml(label)}</h4><pre>${escapeHtml(snippets[name][key])}</pre></div>`)
          .join('')}
      </div>`;
  return `<section id="identity-codegen">
    <h2>Identity codegen</h2>
    <div class="codegen">
      ${block('identify')}
      ${block('update')}
      ${block('anonymize')}
    </div>
  </section>`;
}

/**
 * Renders the "Consent categories" documentation section: one row per client category, showing
 * which standard Bloomreach consent key (seed or project addition) it fulfils, matching the
 * `consents: { newsletter: "brand_consent" }` shape in `data-mapping.json` (D-26).
 */
export function renderConsentCategoriesSection(categories: ConsentCategoryForDocs[]): string {
  if (categories.length === 0) {
    return '<section id="consent-categories"><h2>Consent categories</h2><p>No consent categories defined.</p></section>';
  }
  const rows = categories
    .map(
      (category) => `<tr>
        ${cell(category.name)}
        ${cell(category.standard_key)}
        ${cell(category.description)}
        ${cell(enumLabelOr('status', category.status))}
      </tr>`
    )
    .join('\n');
  return `<section id="consent-categories">
    <h2>Consent categories</h2>
    <table>
      <thead>
        <tr><th>Client category</th><th>Standard key</th><th>Description</th><th>Status</th></tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </section>`;
}

/**
 * Renders the project-wide "Properties" section: one block per customer-scope property, listing
 * every named definition it carries (D-58) -- name, description, allowed values, formats, example
 * values. A property with a single (`general`) definition renders one row, same as today; a
 * property whose event links diverge lists every named definition here regardless of which event
 * card is looking at it (T-4-00 review follow-up, closed by T-4-03: the HTML export previously had
 * no per-property definition list, only the inline per-event one in `buildPropertyDetailsTable`).
 */
export function renderPropertiesSection(properties: PropertyForDocs[]): string {
  if (properties.length === 0) {
    return '<section id="properties"><h2>Properties</h2><p>No properties defined.</p></section>';
  }
  const renderBlock = (property: PropertyForDocs): string => {
    const rows = property.definitions
      .map(
        (definition) => `<tr>
            ${cell(definition.name)}
            ${cell(definition.description)}
            ${cell(definition.allowed_values ? definition.allowed_values.map((v) => v.value).join(', ') : null)}
            ${cell(definition.formats && definition.formats.length > 0 ? definition.formats.map(formatDisplayName).join(', ') : null)}
            ${cell(definition.example_values !== undefined && definition.example_values !== null ? formatExampleValues(definition.example_values) : null)}
          </tr>`
      )
      .join('\n');
    return `<div class="property-block">
        <h4>${escapeHtml(property.name)} <small>(${escapeHtml(property.data_type)}${property.pii ? ', PII' : ''})</small></h4>
        ${property.description ? `<p>${escapeHtml(property.description)}</p>` : ''}
        <table>
          <thead>
            <tr><th>Definition</th><th>Description</th><th>Allowed values</th><th>Formats</th><th>Example</th></tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>`;
  };
  // D-64: System customer / Customer / SDK default / Event, Event split by D-63 kind.
  const groups = groupPropertiesByCategory(
    properties.map((p) => ({ ...p, category: p.category ?? ('customer' as PropertyCategory), kind: p.kind ?? ('event' as PropertyKind) }))
  );
  const blocks = groups
    .map((group) => {
      const inner =
        group.subgroups.length > 0
          ? group.subgroups
              .map(
                (sub) => `<div id="${propertyKindGroupId(sub.kind)}"><h4 class="property-subgroup">${escapeHtml(sub.label)} (${sub.items.length})</h4>
      ${sub.items.map(renderBlock).join('\n')}</div>`
              )
              .join('\n')
          : group.items.map(renderBlock).join('\n');
      return `<div id="${propertyGroupId(group.category)}" class="property-group">
      <h3>${escapeHtml(group.label)} (${group.items.length})</h3>
      ${inner}
    </div>`;
    })
    .join('\n');
  return `<section id="properties">
    <h2>Properties</h2>
    ${blocks}
  </section>`;
}

/** D-64 (T-4-20): a catalog for the project-wide "Catalogs" section. `owner`/`client_name` are not part of this shape. */
export interface CatalogForDocs {
  name: string;
  description?: string | null;
  mapping_role?: string | null;
  status?: string | null;
  source_system?: string | null;
  sync_method?: string | null;
  update_frequency?: string | null;
  /** D-61 (T-4-11B), optional so older callers stay valid. */
  kind?: string | null;
  market?: string | null;
  language?: string | null;
  version?: string | null;
  live?: boolean;
  fields: { name: string; data_type?: string | null; is_lookup_key: boolean; is_searchable: boolean; description?: string | null }[];
  mapped_properties: { property_name: string; scope: string; field_name: string | null }[];
}

/** Renders the "Catalogs" section: one block per catalog with its fields and the properties that look up into it (D-64). Empty string when there are no catalogs. */
export function renderCatalogsSection(catalogs: CatalogForDocs[]): string {
  if (catalogs.length === 0) return '';
  const yes = (v: boolean): string => (v ? 'yes' : '—');
  const blocks = catalogs
    .map((catalog) => {
      const marketLabel = [catalog.market, catalog.language].filter(Boolean).join(' / ');
      const searchableCount = catalog.fields.filter((f) => f.is_searchable).length;
      const lookupKey = catalog.fields.find((f) => f.is_lookup_key)?.name;
      const meta = [
        catalog.kind ? `${catalog.kind} catalog` : '',
        marketLabel ? `market: ${marketLabel}` : '',
        catalog.version ? `version: ${catalog.version}${catalog.live ? ' (live)' : ''}` : '',
        catalog.kind ? `${searchableCount} searchable` : '',
        catalog.kind && lookupKey ? `lookup key: ${lookupKey}` : '',
        catalog.mapping_role ? `mapping role: ${catalog.mapping_role}` : '',
        enumLabelOr('status', catalog.status),
        catalog.source_system ? `source: ${catalog.source_system}` : '',
        catalog.sync_method ? `sync: ${catalog.sync_method}` : '',
        catalog.update_frequency ? `updates: ${catalog.update_frequency}` : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const fieldRows = catalog.fields
        .map((f) => `<tr>${cell(f.name)}${cell(f.data_type)}<td>${yes(f.is_lookup_key)}</td><td>${yes(f.is_searchable)}</td>${cell(f.description)}</tr>`)
        .join('\n');
      const mappedRows = catalog.mapped_properties
        .map((m) => `<tr>${cell(m.property_name)}${cell(m.scope)}${cell(m.field_name)}</tr>`)
        .join('\n');
      return `<div class="catalog-block">
        <h3>${escapeHtml(catalog.name)}${meta ? ` <small>(${escapeHtml(meta)})</small>` : ''}</h3>
        ${catalog.description ? `<p>${escapeHtml(catalog.description)}</p>` : ''}
        ${
          catalog.fields.length === 0
            ? '<p class="muted">No fields defined.</p>'
            : `<table><thead><tr><th>Field</th><th>Type</th><th>Lookup key</th><th>Searchable</th><th>Description</th></tr></thead><tbody>${fieldRows}</tbody></table>`
        }
        ${
          catalog.mapped_properties.length === 0
            ? ''
            : `<h4>${catalog.kind === 'product' || catalog.kind === 'variant' ? `Looked up by (all ${escapeHtml(catalog.kind)} catalogs)` : 'Properties that look up into this catalog'}</h4><table><thead><tr><th>Property</th><th>Scope</th><th>Catalog field</th></tr></thead><tbody>${mappedRows}</tbody></table>`
        }
      </div>`;
    })
    .join('\n');
  return `<section id="catalogs">
    <h2>Catalogs</h2>
    ${blocks}
  </section>`;
}

/**
 * Renders the "Variants" subsection nested under one event's section (T-1-05 acceptance: "docs
 * export lists variants under each event"). Each row shows the generated name, the human-readable
 * conditions and the standard event it maps to, if any.
 */
export function renderVariantsSubsection(variants: VariantForDocs[]): string {
  if (variants.length === 0) return '';
  const rows = variants
    .map(
      (variant) => `<tr class="variant-row">
        ${cell(variant.name)}
        ${cell(variant.conditionsText)}
        ${cell(variant.description)}
        ${cell(variant.standard_event)}
      </tr>`
    )
    .join('\n');
  return `<div class="variants">
    <h3>Variants</h3>
    <table>
      <thead>
        <tr><th>Variant</th><th>Conditions</th><th>Description</th><th>Standard event</th></tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </div>`;
}

/**
 * Renders the project-level "Standard event mappings" section (T-1-05 acceptance): one row per
 * `StandardEventMapping`, the mapped event/variant and a summary of the field map.
 */
export function renderStandardEventMappingsSection(mappings: StandardEventMappingForDocs[]): string {
  if (mappings.length === 0) {
    return '<section id="standard-event-mappings"><h2>Standard event mappings</h2><p>No standard event mappings defined.</p></section>';
  }
  const blocks = mappings
    .map((mapping) => {
      const g = groupFieldMap(mapping.field_map);
      const rows = [
        ...g.mapped.map((m) => `<tr>${cell(m.field)}${cell(m.property)}</tr>`),
        ...g.unmapped.map((field) => `<tr>${cell(field)}<td class="muted">not mapped</td></tr>`),
      ].join('\n');
      return `<div class="mapping-block">
        <h3>${escapeHtml(mappingHeading(mapping.standard_event, mapping.event_name, mapping.variant_name))} <small>(${escapeHtml(g.summary)})</small></h3>
        ${
          g.total === 0
            ? ''
            : `<table>
          <thead><tr><th>Bloomreach field</th><th>Project property</th></tr></thead>
          <tbody>
            ${rows}
          </tbody>
        </table>`
        }
      </div>`;
    })
    .join('\n');
  return `<section id="standard-event-mappings">
    <h2>Standard event mappings</h2>
    ${blocks}
  </section>`;
}

/**
 * Renders the project "Findings summary" section (T-4-19): open counts by severity and by
 * comparison, the top events by open errors (linked to their sections) and the acknowledged count.
 * Input comes from `computeFindingsSummary`, so the shared view and this export agree.
 */
export function renderFindingsSummarySection(summary: FindingsSummaryView, eventAnchor: (eventId: string) => string | null): string {
  if (summary.total === 0 && summary.acknowledged.total === 0) return '';
  const cmpRows = summary.byComparison
    .map(
      (c) =>
        `<tr><td><span title="${escapeHtml(comparisonTooltip(c.comparison))}">${escapeHtml(comparisonLabel(c.comparison))}</span></td>${cell(String(c.error))}${cell(String(c.warning))}${cell(String(c.info))}</tr>`
    )
    .join('\n');
  const familyRows = (summary.byFamily ?? [])
    .map((f) => {
      const kinds = f.kinds
        .map((k) => `<span title="${escapeHtml(kindTooltip(k.kind))}">${escapeHtml(kindLabel(k.kind))}</span> (${k.count})`)
        .join(', ');
      return `<tr><td><span title="${escapeHtml(FAMILY_INFO[f.family].explanation)}">${escapeHtml(FAMILY_INFO[f.family].label)}</span></td><td>${kinds}</td>${cell(String(f.total))}${cell(FAMILY_INFO[f.family].next)}</tr>`;
    })
    .join('\n');
  const topRows = summary.topEvents
    .map((e) => {
      const anchor = eventAnchor(e.id);
      const name = anchor ? `<a href="#${escapeHtml(anchor)}">${escapeHtml(e.name)}</a>` : escapeHtml(e.name);
      return `<tr><td>${name}</td>${cell(String(e.errors))}${cell(String(e.total))}</tr>`;
    })
    .join('\n');
  const ack = summary.acknowledged;
  return `<section id="findings-summary">
    <h2>Findings summary</h2>
    <p><strong>${summary.total} open</strong>: error ${summary.bySeverity.error}, warning ${summary.bySeverity.warning}, info ${summary.bySeverity.info}${
      ack.total > 0 ? `. Acknowledged: error ${ack.error}, warning ${ack.warning}, info ${ack.info}` : ''
    }</p>
    ${
      familyRows === ''
        ? ''
        : `<h3>By kind of problem</h3>
    <table><thead><tr><th>Family</th><th>Kinds</th><th>Open</th><th>Next step</th></tr></thead><tbody>${familyRows}</tbody></table>`
    }
    ${
      summary.byComparison.length === 0
        ? ''
        : `<h3>By comparison</h3>
    <table><thead><tr><th>Comparison</th><th>Error</th><th>Warning</th><th>Info</th></tr></thead><tbody>${cmpRows}</tbody></table>`
    }
    ${
      summary.topEvents.length === 0
        ? ''
        : `<h3>Top events by open errors</h3>
    <table><thead><tr><th>Event</th><th>Errors</th><th>All open</th></tr></thead><tbody>${topRows}</tbody></table>`
    }
  </section>`;
}

/**
 * Renders the "Use cases" documentation section (T-1-07 acceptance: "Docs export includes use
 * cases with their ordered requirements"): one subsection per use case, its metadata, narrative,
 * and an ordered table of its requirements resolved to display names.
 */
export function renderUseCasesSection(useCases: UseCaseForDocs[]): string {
  if (useCases.length === 0) {
    return '<section id="use-cases"><h2>Use cases</h2><p>No use cases defined.</p></section>';
  }
  const items = useCases
    .map((useCase) => {
      const rows = useCase.requirements
        .map(
          (req) => `<tr>
            ${cell(req.target_label)}
            ${cell(enumLabelOr('level', req.level))}
            ${cell(enumLabelOr('status', req.status))}
            ${cell(req.note)}
          </tr>`
        )
        .join('\n');
      const requirementsTable =
        useCase.requirements.length === 0
          ? '<p class="empty">No requirements defined.</p>'
          : `<table>
              <thead><tr><th>Target</th><th>Level</th><th>Status</th><th>Note</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>`;
      return `<div class="use-case">
        <h3>${escapeHtml(useCase.code ? `${useCase.code} — ${useCase.name}` : useCase.name)}</h3>
        <dl class="use-case-meta">
          ${useCase.type ? `<dt>Type</dt><dd>${escapeHtml(useCase.type)}</dd>` : ''}
          ${useCase.priority ? `<dt>Priority</dt><dd>${escapeHtml(enumLabelOr('priority', useCase.priority))}</dd>` : ''}
          ${useCase.status ? `<dt>Status</dt><dd>${escapeHtml(enumLabelOr('status', useCase.status))}</dd>` : ''}
          ${useCase.owner ? `<dt>Owner</dt><dd>${escapeHtml(useCase.owner)}</dd>` : ''}
        </dl>
        ${useCase.description ? `<p class="description">${escapeHtml(useCase.description)}</p>` : ''}
        ${useCase.documentation_url ? `<p class="documentation-link"><a href="${escapeHtml(useCase.documentation_url)}" target="_blank" rel="noopener noreferrer">Documentation</a></p>` : ''}
        ${useCase.narrative ? `<div class="narrative">${renderNarrativeHtml(useCase.narrative)}</div>` : ''}
        <h4>Requirements</h4>
        ${requirementsTable}
      </div>`;
    })
    .join('\n');
  return `<section id="use-cases">
    <h2>Use cases</h2>
    ${items}
  </section>`;
}

/** Minimal shape the certification badge needs (`EventCard.certification`, T-2-08, D-05). */
export interface CertificationForDocs {
  applicable: boolean;
  certified: boolean;
  reasons: string[];
}

/**
 * Renders the certification badge for one event's section (T-2-08 acceptance: "the Documentation
 * HTML export renders ... certification ... from the same `EventCard`"), same three states the
 * event card page shows: not applicable (sdk/platform), certified, or blocked with its reasons.
 */
export function renderCertificationBadge(certification: CertificationForDocs): string {
  if (!certification.applicable) {
    return '<p class="certification not-applicable"><strong>Certification:</strong> n/a (not a custom event)</p>';
  }
  if (certification.certified) {
    return '<p class="certification certified"><strong>Certification:</strong> certified</p>';
  }
  return `<p class="certification not-certified"><strong>Certification:</strong> not certified (${escapeHtml(certification.reasons.join(', '))})</p>`;
}

/** Minimal shape the rules table needs (`EventCard.rules[]`, T-2-08, D-30/D-31). */
export interface RuleForDocs {
  name: string;
  kind: string;
  message: string;
  expression_text: string;
  tolerance: { mode: string; value: number | null };
  enabled: boolean;
  /** `null` for an unconditional (event-wide) rule; a variant name scopes it to that variant's
   * observations only (ERROR 3 fix round -- dropping this made a variant-scoped guardrail read as
   * if it applied to every observation of the event). */
  variant_name: string | null;
}

/**
 * Renders the guardrail rules table for one event's section (T-2-08 acceptance: "... rules ... from
 * the same `EventCard`"): name, kind, the resolved expression text, message, tolerance and scope
 * (ERROR 3 fix round: the variant a variant-scoped rule is limited to, or "all" for the event-wide
 * default).
 */
export function renderRulesTable(rules: RuleForDocs[]): string {
  if (rules.length === 0) return '';
  const rows = rules
    .map(
      (rule) => `<tr>
        ${cell(rule.name)}
        ${cell(rule.kind)}
        ${cell(rule.expression_text)}
        ${cell(rule.message)}
        ${cell(rule.tolerance.mode === 'none' ? null : `${rule.tolerance.mode}${rule.tolerance.value != null ? ` (${rule.tolerance.value})` : ''}`)}
        ${cell(rule.variant_name ?? 'all')}
        ${cell(rule.enabled ? 'enabled' : 'disabled')}
      </tr>`
    )
    .join('\n');
  return `<div class="rules">
    <h3>Guardrail rules</h3>
    <table>
      <thead>
        <tr><th>Name</th><th>Kind</th><th>Expression</th><th>Message</th><th>Tolerance</th><th>Scope</th><th>Status</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/** Minimal shape the findings table needs (`EventCard.findings[]`, D-40 Q9 fix round). */
export interface FindingForDocs {
  severity: string;
  kind: string;
  comparison: string;
  property: string | null;
  variant: string | null;
  /** The originating rule's name (fix round 2), `null` for a finding that did not come from a rule. */
  rule: string | null;
  message: string | null;
  /** D-89 (T-5-47): the derived priority and its reasons (shown as the cell's tooltip). */
  priority?: string;
  priority_reasons?: string[];
}

/**
 * Renders a compact table of currently-open findings (D-40 Q9 fix round, ERROR 1): the same list
 * `EventCard.findings[]`/the tracking document carry, so the HTML export never claims an event is
 * not-certified without showing why. `heading`/`emptyClass` let the same renderer serve both the
 * per-event "Open findings" table and the document-level "Open findings without an event" table
 * (fix round 2, `unattached_findings`).
 */
export function renderFindingsTable(findings: FindingForDocs[], heading = 'Open findings'): string {
  if (findings.length === 0) return '';
  const rows = findings
    .map(
      (f) => `<tr>
        <td><span title="${escapeHtml((f.priority_reasons ?? []).join('; '))}">${escapeHtml(f.priority ?? '')}</span></td>
        ${cell(enumLabelOr('severity', f.severity))}
        <td><span title="${escapeHtml(f.kind)}: ${escapeHtml(kindTooltip(f.kind))}">${escapeHtml(kindLabel(f.kind))}</span></td>
        <td><span title="${escapeHtml(f.comparison)}: ${escapeHtml(comparisonTooltip(f.comparison))}">${escapeHtml(comparisonLabel(f.comparison))}</span></td>
        ${cell(f.property)}
        ${cell(f.variant)}
        ${cell(f.rule)}
        ${cell(f.message)}
      </tr>`
    )
    .join('\n');
  return `<div class="findings">
    <h3>${escapeHtml(heading)}</h3>
    <table>
      <thead>
        <tr><th>Priority</th><th>Severity</th><th>Kind</th><th>Comparison</th><th>Property</th><th>Variant</th><th>Rule</th><th>Message</th></tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`;
}

/** Minimal shape the coverage summary needs (`EventCard.coverage`, T-2-08, D-21 coverage grid). */
export interface CoverageSummaryForDocs {
  observed_count: number;
  unobserved_count: number;
}

/**
 * Renders the one-line coverage summary for one event's section (T-2-08 acceptance: "... coverage
 * summary ... from the same `EventCard`"): how many variant x context cells have been observed vs.
 * not, out of the full grid.
 */
export function renderCoverageSummary(coverage: CoverageSummaryForDocs): string {
  const total = coverage.observed_count + coverage.unobserved_count;
  if (total === 0) return '';
  return `<p class="coverage-summary"><strong>Coverage:</strong> ${coverage.observed_count} of ${total} variant/context combinations observed.</p>`;
}

/**
 * Renders the computed requirements matrix (CONTEXT.md 3.2: "computed, not authored"): rows =
 * distinct requirement targets, columns = use cases, cell = level.
 */
export function renderRequirementsMatrixSection(matrix: RequirementsMatrixForDocs): string {
  if (matrix.use_cases.length === 0 || matrix.rows.length === 0) {
    return '<section id="requirements-matrix"><h2>Requirements matrix</h2><p>No requirements defined yet.</p></section>';
  }
  const header = matrix.use_cases
    .map((uc) => `<th>${escapeHtml(uc.code ? `${uc.code} — ${uc.name}` : uc.name)}</th>`)
    .join('');
  const rows = matrix.rows
    .map((row) => {
      const cells = matrix.use_cases.map((uc) => cell(row.cells[uc.id] ?? null)).join('');
      return `<tr>${cell(row.label)}${cells}</tr>`;
    })
    .join('\n');
  return `<section id="requirements-matrix">
    <h2>Requirements matrix</h2>
    <table>
      <thead><tr><th>Target</th>${header}</tr></thead>
      <tbody>${rows}</tbody>
    </table>
  </section>`;
}

/**
 * Pure HTML-fragment renderers for the project documentation export (D-18's
 * `GET /export/documentation.html`). Both functions take already-resolved rows (no DB access) and
 * are covered by `sections.test.ts`. `generateProjectDocumentationHtml` (export.service.ts, wired
 * in during the T-1-06 integration round) calls `renderIdentityRulesSection` and
 * `renderConsentCategoriesSection` alongside the existing property/event sections, resolving
 * `trigger_event_name`/`source_name` from ids before calling in.
 */
import { escapeHtml } from '../htmlEscape';

export { escapeHtml };

/** Minimal shape the identity rules section needs; DAL row plus resolved display names. */
export interface IdentityRuleForDocs {
  bloomreach_field: string;
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

function cell(value: string | null | undefined): string {
  const text = value == null || value === '' ? '—' : value;
  return `<td>${escapeHtml(text)}</td>`;
}

/**
 * Renders the "Identity rules" documentation section: one row per rule, ordered as passed in
 * (callers pass `listIdentityRules`'s already sort_order-ordered result).
 */
export function renderIdentityRulesSection(rules: IdentityRuleForDocs[]): string {
  if (rules.length === 0) {
    return '<section id="identity-rules"><h2>Identity rules</h2><p>No identity rules defined.</p></section>';
  }
  const rows = rules
    .map(
      (rule) => `<tr>
        ${cell(rule.name)}
        ${cell(rule.bloomreach_field)}
        ${cell(rule.identity_type)}
        ${cell(rule.trigger_event_name)}
        ${cell(rule.trigger_text)}
        ${cell(rule.value_rule)}
        ${cell(rule.example)}
        ${cell(rule.owner)}
        ${cell(rule.source_name)}
        ${cell(rule.tracker)}
        ${cell(rule.priority)}
        ${cell(rule.status)}
      </tr>`
    )
    .join('\n');
  return `<section id="identity-rules">
    <h2>Identity rules</h2>
    <table>
      <thead>
        <tr>
          <th>Name</th><th>Bloomreach field</th><th>Identity type</th><th>Trigger event</th>
          <th>Trigger</th><th>Value rule</th><th>Example</th><th>Owner</th><th>Source</th>
          <th>Tracker</th><th>Priority</th><th>Status</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
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
        ${cell(category.status)}
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
  const rows = mappings
    .map((mapping) => {
      const fieldMapText = Object.entries(mapping.field_map)
        .filter(([, v]) => v)
        .map(([field, v]) => `${field} → ${v}`)
        .join(', ');
      return `<tr>
        ${cell(mapping.standard_event)}
        ${cell(mapping.event_name)}
        ${cell(mapping.variant_name)}
        ${cell(fieldMapText)}
      </tr>`;
    })
    .join('\n');
  return `<section id="standard-event-mappings">
    <h2>Standard event mappings</h2>
    <table>
      <thead>
        <tr><th>Standard event</th><th>Event</th><th>Variant</th><th>Field map</th></tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  </section>`;
}

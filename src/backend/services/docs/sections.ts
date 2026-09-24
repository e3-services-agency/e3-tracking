/**
 * Pure HTML-fragment renderers for the project documentation export (D-18's
 * `GET /export/documentation.html`). Split out from `export.service.ts` because that service does
 * not exist yet in this worktree — T-1-03 adds it in parallel and has not merged (see the T-1-06
 * handoff). Both functions take already-resolved rows (no DB access) and are covered by
 * `sections.test.ts`; T-1-03/whoever finishes the export service should call
 * `renderIdentityRulesSection` and `renderConsentCategoriesSection` alongside the existing
 * property/event sections once this branch merges.
 */

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

/** Escapes text for safe interpolation into an HTML document (D-04: exports are plain files, no templating engine). */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
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

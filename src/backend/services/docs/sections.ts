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
}

/** Minimal shape the identity codegen block needs (D-38, `buildIdentityCodegen`'s output). */
export interface IdentityCodegenForDocs {
  identify: string;
  update: string;
  anonymize: string;
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
export function renderIdentityRulesSection(rules: IdentityRuleForDocs[]): string {
  if (rules.length === 0) {
    return '<section id="identity-rules"><h2>Identity rules</h2><p>No identity rules defined.</p></section>';
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
          <th>Name</th><th>Identifier name</th><th>Identity type</th><th>SDK call</th>
          <th>Transformations</th><th>Trigger event</th>
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
 * Renders the "Identity codegen" documentation section (D-38): the three Web SDK snippets
 * `buildIdentityCodegen` produces from the project's identity rules and mapped customer
 * properties, so the migration engineer can copy them straight from the exported HTML.
 */
export function renderIdentityCodegenSection(snippets: IdentityCodegenForDocs): string {
  return `<section id="identity-codegen">
    <h2>Identity codegen</h2>
    <div class="codegen">
      <div>
        <h3>identify</h3>
        <pre>${escapeHtml(snippets.identify)}</pre>
      </div>
      <div>
        <h3>update</h3>
        <pre>${escapeHtml(snippets.update)}</pre>
      </div>
      <div>
        <h3>anonymize</h3>
        <pre>${escapeHtml(snippets.anonymize)}</pre>
      </div>
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
            ${cell(req.level)}
            ${cell(req.status)}
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
          ${useCase.priority ? `<dt>Priority</dt><dd>${escapeHtml(useCase.priority)}</dd>` : ''}
          ${useCase.status ? `<dt>Status</dt><dd>${escapeHtml(useCase.status)}</dd>` : ''}
          ${useCase.owner ? `<dt>Owner</dt><dd>${escapeHtml(useCase.owner)}</dd>` : ''}
        </dl>
        ${useCase.description ? `<p class="description">${escapeHtml(useCase.description)}</p>` : ''}
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
        ${cell(f.severity)}
        ${cell(f.kind)}
        ${cell(f.comparison)}
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
        <tr><th>Severity</th><th>Kind</th><th>Comparison</th><th>Property</th><th>Variant</th><th>Rule</th><th>Message</th></tr>
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

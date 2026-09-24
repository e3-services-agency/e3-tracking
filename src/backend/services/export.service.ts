/**
 * Documentation export (D-10, D-18): project-scope self-contained HTML file, one section per
 * non-deleted event (name, description, purpose, trigger text, identity note, property table,
 * codegen snippets). Journey-scoped export and the manual QA overlay are gone (D-17, D-18); this
 * is the minimal replacement that keeps documentation output alive until use cases (T-1-07) add
 * the ordered requirement view on top. Images referenced by triggers are embedded as data URIs
 * from the local FileStore (D-14) so the file is fully self-contained (no server round-trip to
 * view it later). System font stack only (D-07) — no external CDN fonts.
 */
import { getProjectWithClient, type ProjectWithClient } from '../dal/project.dal';
import {
  listEvents,
  getEventWithProperties,
  type EventWithCounts,
  type EventPropertyWithDetails,
} from '../dal/event.dal';
import {
  buildCodegenSnippets,
  jsonSampleValueForProperty,
  type AttachedPropertyForCodegen,
  type CodegenSnippets,
} from './codegen.service';
import { getFileStore } from '../files/FileStore';
import type { CodegenEventNameOverrides } from '../../types/schema';
import { listIdentityRules } from '../dal/identity-rule.dal';
import { listConsentCategories } from '../dal/consent-category.dal';
import { listSources } from '../dal/source.dal';
import { renderIdentityRulesSection, renderConsentCategoriesSection } from './docs/sections';
import { escapeHtml } from './htmlEscape';

export { escapeHtml };

interface TriggerEntry {
  title?: string;
  description?: string;
  image_path?: string | null;
  source?: string | null;
  order?: number;
}

function toAttachedPropertyForCodegen(link: EventPropertyWithDetails): AttachedPropertyForCodegen {
  return {
    property_name: link.payload_key?.trim() || link.property.name,
    // D-16 dropped presence; codegen reads `EventProperty.required` directly (T-1-03/T-1-04
    // integration WARNING 4: this must stay `required`, never `presence`, or every property
    // silently renders as optional in the generated snippets/docs).
    required: link.required,
    property_data_type: link.property.data_type,
    property_data_formats: (link.property.data_formats_json as string[] | null) ?? null,
    property_example_values_json:
      (link.property.example_values_json as AttachedPropertyForCodegen['property_example_values_json']) ?? null,
    property_value_schema_json:
      (link.property.value_schema_json as AttachedPropertyForCodegen['property_value_schema_json']) ?? null,
  };
}

/**
 * Renders the attached-property table for one event: name, required/optional, role, data type,
 * payload key, description. Exported so it can be unit-tested and reused (docs export contract).
 */
export function buildPropertyDetailsTable(properties: EventPropertyWithDetails[]): string {
  if (properties.length === 0) {
    return '<p class="empty">No properties attached.</p>';
  }
  const rows = properties
    .map((link) => {
      const description = link.description_override?.trim() || link.property.description?.trim() || '';
      return `<tr>
        <td>${escapeHtml(link.property.name)}</td>
        <td>${link.required ? 'Required' : 'Optional'}</td>
        <td>${escapeHtml(link.role)}</td>
        <td>${escapeHtml(link.property.data_type)}</td>
        <td>${escapeHtml(link.payload_key?.trim() || link.property.name)}</td>
        <td>${escapeHtml(description)}</td>
      </tr>`;
    })
    .join('\n');
  return `<table class="property-table">
    <thead>
      <tr>
        <th>Property</th>
        <th>Required</th>
        <th>Role</th>
        <th>Data type</th>
        <th>Payload key</th>
        <th>Description</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
}

/**
 * Renders a sample JSON payload (keyed by payload key) for one event's attached properties, so
 * the reader sees the expected shape without cross-referencing the table.
 */
export function buildPayloadDoc(properties: EventPropertyWithDetails[]): string {
  const sample: Record<string, unknown> = {};
  for (const link of properties) {
    const key = link.payload_key?.trim() || link.property.name;
    sample[key] = jsonSampleValueForProperty(toAttachedPropertyForCodegen(link));
  }
  return `<pre class="payload-doc"><code>${escapeHtml(JSON.stringify(sample, null, 2))}</code></pre>`;
}

async function buildTriggersHtml(projectId: string, triggers: TriggerEntry[]): Promise<string> {
  if (!Array.isArray(triggers) || triggers.length === 0) return '';
  const sorted = [...triggers].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  const parts = await Promise.all(
    sorted.map(async (trigger) => {
      const title = trigger.title?.trim() || '';
      const description = trigger.description?.trim() || '';
      let imgHtml = '';
      if (trigger.image_path) {
        try {
          const opened = await getFileStore().openForProject(projectId, trigger.image_path);
          const dataUri = `data:${opened.mime};base64,${opened.buffer.toString('base64')}`;
          imgHtml = `<img src="${dataUri}" alt="${escapeHtml(title)}" class="trigger-image" />`;
        } catch {
          // File missing/unreadable: skip the image, keep the text (export must not fail).
        }
      }
      return `<div class="trigger">
        ${title ? `<h4>${escapeHtml(title)}</h4>` : ''}
        ${description ? `<p>${escapeHtml(description)}</p>` : ''}
        ${imgHtml}
      </div>`;
    })
  );
  return `<div class="triggers">${parts.join('\n')}</div>`;
}

function codegenBlock(label: string, code: string): string {
  return `<div class="codegen-snippet">
    <h4>${escapeHtml(label)}</h4>
    <pre><code>${escapeHtml(code)}</code></pre>
  </div>`;
}

function buildCodegenHtml(snippets: CodegenSnippets): string {
  return `<div class="codegen">
    ${codegenBlock('dataLayer', snippets.dataLayer)}
    ${codegenBlock('Bloomreach Web SDK', snippets.bloomreachSdk)}
    ${codegenBlock('Bloomreach Tracking API', snippets.bloomreachApi)}
  </div>`;
}

async function buildEventSectionHtml(
  projectId: string,
  event: EventWithCounts,
  properties: EventPropertyWithDetails[]
): Promise<string> {
  const attached = properties.map(toAttachedPropertyForCodegen);
  const codegen = buildCodegenSnippets(
    event.name,
    attached,
    event.codegen_event_name_overrides_json as CodegenEventNameOverrides | null
  );
  const triggersHtml = await buildTriggersHtml(projectId, (event.triggers_json as TriggerEntry[]) ?? []);

  return `<section class="event" id="event-${escapeHtml(event.id)}">
    <h2>${escapeHtml(event.name)}</h2>
    <dl class="event-meta">
      ${event.business_name ? `<dt>Business name</dt><dd>${escapeHtml(event.business_name)}</dd>` : ''}
      <dt>Type</dt><dd>${escapeHtml(event.event_type)}</dd>
      <dt>Status</dt><dd>${escapeHtml(event.status)}</dd>
      ${event.page ? `<dt>Page</dt><dd>${escapeHtml(event.page)}</dd>` : ''}
      ${event.trigger_text ? `<dt>Trigger</dt><dd>${escapeHtml(event.trigger_text)}</dd>` : ''}
      ${event.identity_note ? `<dt>Identity note</dt><dd>${escapeHtml(event.identity_note)}</dd>` : ''}
    </dl>
    ${event.description ? `<p class="description">${escapeHtml(event.description)}</p>` : ''}
    ${event.purpose ? `<p class="purpose"><strong>Purpose:</strong> ${escapeHtml(event.purpose)}</p>` : ''}
    ${triggersHtml}
    <h3>Properties</h3>
    ${buildPropertyDetailsTable(properties)}
    <h3>Sample payload</h3>
    ${buildPayloadDoc(properties)}
    <h3>Implementation</h3>
    ${buildCodegenHtml(codegen)}
  </section>`;
}

const DOCUMENT_STYLE = `
  :root { color-scheme: light; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; margin: 0; padding: 2rem; color: #1f2933; background: #fff; }
  h1 { margin-bottom: 0.25rem; }
  .subtitle { color: #52606d; margin-top: 0; }
  nav.toc { margin: 1.5rem 0; padding: 1rem; border: 1px solid #e4e7eb; border-radius: 8px; }
  nav.toc a { display: block; padding: 0.15rem 0; color: #1a56db; text-decoration: none; }
  section.event { border-top: 1px solid #e4e7eb; padding: 1.5rem 0; }
  table.property-table { border-collapse: collapse; width: 100%; margin: 0.5rem 0 1rem; }
  table.property-table th, table.property-table td { border: 1px solid #e4e7eb; padding: 0.4rem 0.6rem; text-align: left; font-size: 0.875rem; }
  table.property-table th { background: #f5f7fa; }
  dl.event-meta { display: grid; grid-template-columns: max-content 1fr; gap: 0.15rem 1rem; margin: 0.5rem 0; }
  dl.event-meta dt { font-weight: 600; color: #52606d; }
  pre { background: #0b1120; color: #e5e7eb; padding: 0.75rem 1rem; border-radius: 6px; overflow-x: auto; font-size: 0.8rem; }
  .codegen { display: flex; flex-direction: column; gap: 0.75rem; }
  .trigger-image { max-width: 320px; display: block; margin-top: 0.5rem; border: 1px solid #e4e7eb; border-radius: 4px; }
`;

/**
 * Renders the "Identity rules" and "Consent categories" sections (plan acceptance item "Docs
 * export includes identity rules and consent categories sections"): pulls the already
 * sort_order-ordered DAL rows and resolves `trigger_event_id`/`source_id` to display names before
 * handing off to the pure renderers in `docs/sections.ts` (kept dependency-free of the DB by
 * design, per its own header comment).
 */
function buildIdentityAndConsentSectionsHtml(projectId: string): string {
  const rules = listIdentityRules(projectId);
  const categories = listConsentCategories(projectId);
  // Deleted events are excluded here on purpose: `deleteEvent` (event.dal.ts) nulls out
  // `trigger_event_id` on any rule that pointed at the event it removes, so a non-null
  // `trigger_event_id` at this point always names a live event.
  const eventNameById = new Map(listEvents(projectId).map((event) => [event.id, event.name]));
  const sourceNameById = new Map(listSources(projectId).map((source) => [source.id, source.name]));

  const rulesForDocs = rules.map((rule) => ({
    ...rule,
    trigger_event_name: rule.trigger_event_id ? eventNameById.get(rule.trigger_event_id) ?? null : null,
    source_name: rule.source_id ? sourceNameById.get(rule.source_id) ?? null : null,
  }));

  return `${renderIdentityRulesSection(rulesForDocs)}\n${renderConsentCategoriesSection(categories)}`;
}

/**
 * Renders every non-deleted event of the project, plus the identity rules and consent categories
 * sections, into one self-contained HTML document.
 */
export async function generateProjectDocumentationHtml(projectId: string): Promise<string> {
  const project: ProjectWithClient = getProjectWithClient(projectId);
  const events = listEvents(projectId);

  const sections = await Promise.all(
    events.map(async (event) => {
      const { properties } = getEventWithProperties(projectId, event.id);
      return buildEventSectionHtml(projectId, event, properties);
    })
  );

  const identityAndConsentHtml = buildIdentityAndConsentSectionsHtml(projectId);

  const toc = events
    .map((event) => `<a href="#event-${escapeHtml(event.id)}">${escapeHtml(event.name)}</a>`)
    .join('\n');

  const generatedAt = new Date().toISOString();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(project.name)} — Tracking documentation</title>
<style>${DOCUMENT_STYLE}</style>
</head>
<body>
  <h1>${escapeHtml(project.name)}</h1>
  <p class="subtitle">${escapeHtml(project.client?.name ?? '')} · Generated ${escapeHtml(generatedAt)}</p>
  <nav class="toc">${toc || '<p>No events defined yet.</p>'}</nav>
  ${sections.join('\n')}
  ${identityAndConsentHtml}
</body>
</html>`;
}

/**
 * Documentation export (D-10, D-18): project-scope self-contained HTML file, one section per
 * non-deleted event (name, description, purpose, trigger text, identity note, property table,
 * codegen snippets). The old customer-lifecycle-scoped export and the manual QA review layer are gone (D-17, D-18); this
 * is the minimal replacement that keeps documentation output alive until use cases (T-1-07) add
 * the ordered requirement view on top. Images referenced by triggers are embedded as data URIs
 * from the local FileStore (D-14) so the file is fully self-contained (no server round-trip to
 * view it later). System font stack only (D-07) — no external CDN fonts.
 */
import { triggerImages } from '../../domain/document/triggerImages';
import { enumLabelOr } from '@/src/domain/enumLabels';
import { getProjectWithClient, type ProjectWithClient } from '../dal/project.dal';
import {
  listEvents,
  getEventWithProperties,
  type EventWithCounts,
  type EventPropertyWithDetails,
} from '../dal/event.dal';
import { listVariantsByProject, type VariantRow } from '../dal/variant.dal';
import { listStandardEventMappings } from '../dal/standard-event-mapping.dal';
import {
  buildCodegenV2,
  buildIdentityCodegen,
  jsonSampleValueForProperty,
  toAttachedPropertyForCodegen,
  attachedPropertiesForVariant,
  type AttachedPropertyForCodegen,
} from './codegen.service';
import type { EventCardCodegen } from '../../domain/document/trackingDocument';
import { dataLayerPath, parseDerivation } from '../../domain/codegen/derivation';
import { getFileStore } from '../files/FileStore';
import type { CodegenEventNameOverrides } from '../../types/schema';
import { listIdentityRules } from '../dal/identity-rule.dal';
import { listIdentifiers } from '../dal/identifier.dal';
import { getProjectIdentificationFlow, listIdentityRulesForCodegen } from './identification.service';
import { listProperties, listPropertiesLookingUpCatalog } from '../dal/property.dal';
import { listConsentCategories } from '../dal/consent-category.dal';
import { listCatalogs, listCatalogFields } from '../dal/catalog.dal';
import { classifyProperty, PROPERTY_CATEGORY_LABELS, groupPropertiesByCategory, propertyGroupId } from '../../domain/propertyCategory';
import { listSources } from '../dal/source.dal';
import { listUseCases } from '../dal/use-case.dal';
import { listRequirements } from '../dal/requirement.dal';
import { computeRequirementsMatrix, buildTargetLabelResolver } from './requirements-matrix.service';
import {
  renderIdentityRulesSection,
  renderIdentityCodegenSection,
  renderConsentCategoriesSection,
  renderVariantsSubsection,
  renderStandardEventMappingsSection,
  renderFindingsSummarySection,
  renderUseCasesSection,
  renderRequirementsMatrixSection,
  renderCertificationBadge,
  renderRulesTable,
  renderCoverageSummary,
  renderFindingsTable,
  renderPropertiesSection,
  renderCatalogsSection,
  type CatalogForDocs,
  type VariantForDocs,
  type StandardEventMappingForDocs,
  type UseCaseForDocs,
  type PropertyForDocs,
} from './docs/sections';
import * as PropertyDefinitionDAL from '../dal/property-definition.dal';
import { escapeHtml } from './htmlEscape';
import { displaySampleValue } from '../../domain/examples';
import { computeFindingsSummary } from '../../domain/document/findingsSummary';
import { PROPERTY_DEFINITION_DEFAULT_NAME } from '../../domain/enums';
import { buildEventCard, buildEventCardContext, buildUnattachedFindings, catalogLinksForProperties, type EventCardBuildContext } from './document.service';
import { sourceViaLabel } from '../../domain/sources';

export { escapeHtml };

interface TriggerEntry {
  title?: string;
  description?: string;
  image_path?: string | null;
  images?: string[];
  source?: string | null;
  order?: number;
}

/** Readable example cell (T-4-19): scalars as text, objects pretty-printed in a code span. */
function renderExampleHtml(value: unknown): string {
  const d = displaySampleValue(value);
  if (d.text === '') return '—';
  return d.block ? `<pre class="example"><code>${escapeHtml(d.text)}</code></pre>` : `<code>${escapeHtml(d.text)}</code>`;
}

/**
 * Renders the attached-property table for one event: name, required/optional, role, data type,
 * payload key, description. Exported so it can be unit-tested and reused (docs export contract).
 */
export function buildPropertyDetailsTable(
  properties: EventPropertyWithDetails[],
  method: string = 'client_web',
  /** D-61 (T-4-11B): when given, adds the "Catalog field" column (`catalog.field` per linked property). */
  catalogFieldLabelById?: Map<string, string>
): string {
  if (properties.length === 0) {
    return '<p class="empty">No properties attached.</p>';
  }
  const rows = properties
    .map((link) => {
      // D-58: this event's own definition wins (e.g. `consent`'s `action` description differs from
      // `cart_update`'s), falling back to the shared Property's description.
      const definition = (link as { definition?: { description: string | null; name: string } | null }).definition;
      const description = definition?.description?.trim() || link.property.description?.trim() || '';
      const definitionLabel =
        definition && definition.name !== PROPERTY_DEFINITION_DEFAULT_NAME ? ` (${escapeHtml(definition.name)})` : '';
      return `<tr>
        <td>${escapeHtml(link.property.name)}${definitionLabel}</td>
        <td>${link.required ? 'Required' : 'Optional'}</td>
        <td>${escapeHtml(link.role)}</td>
        <td>${escapeHtml(link.property.data_type)}</td>
        <td>${escapeHtml(link.payload_key?.trim() || link.property.name)}</td>
        <td>${escapeHtml(enumLabelOr('property_kind', link.property.kind ?? 'event'))}</td>
        <td>${method === 'client_web' ? escapeHtml(dataLayerPath(link.property.kind ?? 'event', link.payload_key?.trim() || link.property.name, parseDerivation(link.property.derivation_json))) : 'n/a'}</td>
        ${catalogFieldLabelById ? `<td>${escapeHtml(link.property.mapped_catalog_field_id ? (catalogFieldLabelById.get(link.property.mapped_catalog_field_id) ?? '') : '')}</td>` : ''}
        <td>${escapeHtml(description)}</td>
        <td>${renderExampleHtml(jsonSampleValueForProperty(toAttachedPropertyForCodegen(link)))}</td>
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
        <th>Kind</th>
        <th>dataLayer path</th>
        ${catalogFieldLabelById ? '<th>Catalog field</th>' : ''}
        <th>Description</th>
        <th>Example</th>
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
      for (const imagePath of triggerImages(trigger)) {
        try {
          const opened = await getFileStore().openForProject(projectId, imagePath);
          const dataUri = `data:${opened.mime};base64,${opened.buffer.toString('base64')}`;
          imgHtml += `<img src="${dataUri}" alt="${escapeHtml(title)}" class="trigger-image" />`;
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

/** Human-readable condition text for the variants subsection, e.g. "action = add, channel in (web|app)". */
function formatConditionsText(variant: VariantRow, propertyNameById: Map<string, string>): string {
  return (variant.conditions_json as VariantRow['conditions_json'])
    .map((condition) => {
      const name = propertyNameById.get(condition.property_id) ?? condition.property_id;
      return condition.operator === 'equals'
        ? `${name} = ${condition.values[0] ?? ''}`
        : `${name} in (${condition.values.join('|')})`;
    })
    .join(', ');
}

function codegenBlock(label: string, code: string): string {
  return `<div class="codegen-snippet">
    <h4>${escapeHtml(label)}</h4>
    <pre><code>${escapeHtml(code)}</code></pre>
  </div>`;
}

/** D-63 (T-4-17): only the snippets that apply to the event's implementation method (empty ones are skipped). */
function buildCodegenHtml(codegen: EventCardCodegen): string {
  const blocks: [string, string | undefined][] = [
    ['dataLayer', codegen.datalayer],
    ['GTM custom template', codegen.gtm_template],
    ['Bloomreach Web SDK', codegen.web_sdk],
    ['Bloomreach Web SDK (legacy)', codegen.web_sdk_legacy],
    ['Bloomreach Tracking API', codegen.tracking_api],
    ['SDK emits', codegen.sdk_emits],
    ['SDK default properties', codegen.sdk_default_properties],
  ];
  const note = codegen.note?.trim() ? `<p class="codegen-note">${escapeHtml(codegen.note)}</p>` : '';
  return `<div class="codegen">
    ${note}
    ${blocks.filter(([, code]) => code && code.trim()).map(([label, code]) => codegenBlock(label, code as string)).join('\n')}
  </div>`;
}

async function buildEventSectionHtml(
  projectId: string,
  event: EventWithCounts,
  properties: EventPropertyWithDetails[],
  variants: VariantRow[],
  standardEventByVariantId: Map<string, string>,
  cardCtx: EventCardBuildContext,
  publicView: boolean
): Promise<{ html: string; card: ReturnType<typeof buildEventCard> }> {
  const triggersHtml = await buildTriggersHtml(projectId, (event.triggers_json as TriggerEntry[]) ?? []);
  const propertyNameById = new Map(properties.map((link) => [link.property_id, link.property.name]));

  // T-2-08 acceptance: "the HTML documentation export renders the card sections (certification,
  // rules, coverage summary, findings) from the same EventCard" -- one `buildEventCard` call per
  // event, sharing one project-wide `cardCtx` (WARNING 5 fix round) across every event's card
  // instead of each call re-resolving every observation, so this and the event card page/tracking
  // document never drift and the docs export stays O(events + observations).
  const card = buildEventCard(projectId, event.id, cardCtx);
  const certificationHtml = renderCertificationBadge(card.certification);
  const rulesHtml = renderRulesTable(card.rules);
  const coverageSummaryHtml = renderCoverageSummary(card.coverage);
  const findingsHtml = renderFindingsTable(card.findings);

  const variantsHtml = renderVariantsSubsection(
    variants.map<VariantForDocs>((variant) => ({
      name: variant.name,
      description: variant.description,
      conditionsText: formatConditionsText(variant, propertyNameById),
      standard_event: standardEventByVariantId.get(variant.id) ?? null,
    }))
  );

  // One codegen block per variant, literal discriminator values (T-1-05 acceptance).
  const variantCodegenHtml = variants
    .map((variant) => {
      const variantAttached = attachedPropertiesForVariant(properties, variant);
      const variantCodegen = buildCodegenV2(
        event.name,
        variantAttached,
        {
          method: event.implementation_method,
          dlEventName: event.dl_event_name,
          eventClass: event.class,
          hardIdKey: cardCtx.hardIdKey,
          catalogLinks: catalogLinksForProperties(properties, cardCtx),
        },
        event.codegen_event_name_overrides_json as CodegenEventNameOverrides | null
      );
      return `<div class="variant-codegen">
        <h4>${escapeHtml(variant.name)}</h4>
        ${buildCodegenHtml(variantCodegen)}
      </div>`;
    })
    .join('\n');

  const html = `<section class="event" id="event-${escapeHtml(event.id)}">
    <h2>${escapeHtml(event.name)}</h2>
    <dl class="event-meta">
      ${event.business_name ? `<dt>Business name</dt><dd>${escapeHtml(event.business_name)}</dd>` : ''}
      <dt>Class</dt><dd><span class="class-badge ${escapeHtml(event.class)}">${escapeHtml(enumLabelOr('class', event.class))}</span></dd>
      <dt>Implementation method</dt><dd>${escapeHtml(enumLabelOr('implementation', event.implementation_method))}</dd>
      ${event.dl_event_name ? `<dt>dataLayer event</dt><dd>${escapeHtml(event.dl_event_name)}</dd>` : ''}
      ${card.sources && card.sources.length > 0 ? `<dt>Collected from</dt><dd>${escapeHtml(card.sources.map((s) => `${s.name} (${sourceViaLabel(s.system, s.method)})`).join('; '))}</dd>` : ''}
      ${card.identifiers && card.identifiers_derived === false && card.identifiers.length === 0 ? '<dt>Identifiers</dt><dd>none, set by hand</dd>' : ''}
      ${card.identifiers && card.identifiers.length > 0 ? `<dt>Identifiers</dt><dd>${escapeHtml(card.identifiers.join(', '))}${card.identifiers_derived ? ' (derived)' : ''}</dd>` : ''}
      <dt>Status</dt><dd>${escapeHtml(enumLabelOr('status', event.status))}</dd>
      ${event.page ? `<dt>Page</dt><dd>${escapeHtml(event.page)}</dd>` : ''}
      ${event.trigger_text ? `<dt>Trigger</dt><dd>${escapeHtml(event.trigger_text)}</dd>` : ''}
      ${!publicView && event.identity_note ? `<dt>Identity note</dt><dd>${escapeHtml(event.identity_note)}</dd>` : ''}
    </dl>
    ${certificationHtml}
    ${event.description ? `<p class="description">${escapeHtml(event.description)}</p>` : ''}
    ${event.purpose ? `<p class="purpose"><strong>Purpose:</strong> ${escapeHtml(event.purpose)}</p>` : ''}
    ${triggersHtml}
    <h3>Properties</h3>
    ${buildPropertyDetailsTable(properties, event.implementation_method, cardCtx.catalogFieldLabelById)}
    <h3>Sample payload</h3>
    ${buildPayloadDoc(properties)}
    <h3>Implementation</h3>
    ${buildCodegenHtml(card.codegen)}
    ${variantsHtml}
    ${variantCodegenHtml}
    ${rulesHtml}
    ${coverageSummaryHtml}
    ${findingsHtml}
  </section>`;
  return { html, card };
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
  td.muted { color: #9aa5b1; font-style: italic; }
  .class-badge { display: inline-block; padding: 0 0.4rem; border: 1px solid #e4e7eb; border-radius: 4px; font-size: 0.8rem; }
  .class-badge.sdk, .class-badge.platform { background: #FFD500; border-color: #FFD500; color: #1A1E38; font-weight: 600; }
  td, th { overflow-wrap: anywhere; }
  pre.example { margin: 0; padding: 0.4rem 0.6rem; font-size: 0.75rem; }
  .mapping-block { margin: 0.5rem 0 1rem; }
  .mapping-block table { border-collapse: collapse; width: 100%; }
  .mapping-block th, .mapping-block td { border: 1px solid #e4e7eb; padding: 0.3rem 0.6rem; text-align: left; font-size: 0.875rem; }
  .trigger-image { max-width: 320px; display: block; margin-top: 0.5rem; border: 1px solid #e4e7eb; border-radius: 4px; }
`;

/**
 * Renders the "Identity rules" and "Consent categories" sections (plan acceptance item "Docs
 * export includes identity rules and consent categories sections"): pulls the already
 * sort_order-ordered DAL rows and resolves `trigger_event_id`/`source_id` to display names before
 * handing off to the pure renderers in `docs/sections.ts` (kept dependency-free of the DB by
 * design, per its own header comment).
 */
function buildIdentityAndConsentSectionsHtml(projectId: string, publicView: boolean): string {
  const rules = listIdentityRules(projectId);
  const categories = listConsentCategories(projectId);
  // Deleted events are excluded here on purpose: `deleteEvent` (event.dal.ts) nulls out
  // `trigger_event_id` on any rule that pointed at the event it removes, so a non-null
  // `trigger_event_id` at this point always names a live event.
  const eventNameById = new Map(listEvents(projectId).map((event) => [event.id, event.name]));
  const sourceNameById = new Map(listSources(projectId).map((source) => [source.id, source.name]));

  const flow = getProjectIdentificationFlow(projectId);
  const flowByRuleId = new Map(flow.rules.map((r) => [r.rule_id, r]));
  const rulesForDocs = rules.map((rule) => ({
    ...rule,
    carried_by: (flowByRuleId.get(rule.id)?.carried_by ?? []).map((e) => e.name),
    // D-48 amendment (fix round, LOW 1): the shared HTML must not carry an identity rule's owner.
    owner: publicView ? null : rule.owner,
    transformations: rule.transformations_json,
    trigger_event_name: rule.trigger_event_id ? eventNameById.get(rule.trigger_event_id) ?? null : null,
    source_name: rule.source_id ? sourceNameById.get(rule.source_id) ?? null : null,
  }));
  const customerProperties = listProperties(projectId, { scope: 'customer' });
  const identityCodegen = buildIdentityCodegen(listIdentityRulesForCodegen(projectId), customerProperties);

  return [
    renderIdentityRulesSection(rulesForDocs, flow.paragraph, listIdentifiers(projectId)),
    renderIdentityCodegenSection(identityCodegen),
    renderConsentCategoriesSection(categories),
  ].join('\n');
}

/**
 * Builds the project-wide "Properties" section (T-4-00 review follow-up, closed by T-4-03): every
 * customer-scope property with every named definition it carries (D-58), the same
 * `properties[].definitions[]` shape the tracking document and the shared view render -- the HTML
 * export previously had no per-property definition list, only the inline per-event one in
 * `buildPropertyDetailsTable` above.
 */
function buildPropertiesSectionHtml(projectId: string): string {
  const customerPropertyRows = listProperties(projectId);
  const definitionsByPropertyId = new Map<string, PropertyDefinitionDAL.PropertyDefinitionRow[]>();
  for (const [, def] of PropertyDefinitionDAL.listAllDefinitionsById(projectId)) {
    const list = definitionsByPropertyId.get(def.property_id) ?? [];
    list.push(def);
    definitionsByPropertyId.set(def.property_id, list);
  }
  for (const list of definitionsByPropertyId.values()) {
    list.sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }
  const properties: PropertyForDocs[] = customerPropertyRows.map((p) => ({
    name: p.name,
    category: classifyProperty(p),
    kind: p.kind,
    data_type: p.data_type,
    pii: p.pii,
    description: p.description,
    definitions: (definitionsByPropertyId.get(p.id) ?? []).map((d) => ({
      name: d.name,
      description: d.description,
      allowed_values: Array.isArray(d.allowed_values_json)
        ? (d.allowed_values_json as { value: string; label?: string | null }[])
        : null,
      formats: Array.isArray(d.formats_json) ? (d.formats_json as string[]) : [],
      example_values: d.example_values_json,
    })),
  }));
  return renderPropertiesSection(properties);
}

/** D-64 (T-4-20): the "Catalogs" section (empty string when the project has no catalogs). No `owner`/`client_name`. */
function buildCatalogsSectionHtml(projectId: string): string {
  const allProperties = listProperties(projectId);
  const catalogs: CatalogForDocs[] = listCatalogs(projectId).map((c) => {
    const fields = listCatalogFields(projectId, c.id);
    const fieldNameById = new Map(fields.map((f) => [f.id, f.name]));
    return {
      name: c.name,
      description: c.description,
      mapping_role: c.mapping_role,
      status: c.status,
      source_system: c.source_system,
      sync_method: c.sync_method,
      update_frequency: c.update_frequency,
      kind: c.kind,
      market: c.market,
      language: c.language,
      version: c.version,
      live: !!c.live_at,
      fields: fields.map((f) => ({
        name: f.name,
        data_type: f.data_type,
        is_lookup_key: f.is_lookup_key,
        is_searchable: f.is_searchable,
        description: f.description,
      })),
      mapped_properties: listPropertiesLookingUpCatalog(projectId, c).map(({ property_name, scope, field_name }) => ({ property_name, scope, field_name })),
    };
  });
  return renderCatalogsSection(catalogs);
}

/** Table-of-contents links for the Properties (with its category groups) and Catalogs sections. */
function propertiesAndCatalogsToc(projectId: string, hasCatalogs: boolean): string[] {
  const links: string[] = [];
  const props = listProperties(projectId);
  if (props.length > 0) {
    links.push('<a href="#properties">Properties</a>');
    for (const g of groupPropertiesByCategory(props.map((p) => ({ name: p.name, category: classifyProperty(p) })))) {
      links.push('<a href="#' + propertyGroupId(g.category) + '">&nbsp;&nbsp;' + escapeHtml(PROPERTY_CATEGORY_LABELS[g.category]) + ' (' + g.items.length + ')</a>');
    }
  }
  if (hasCatalogs) links.push('<a href="#catalogs">Catalogs</a>');
  return links;
}

/**
 * Renders the "Use cases" section: every non-deleted use case with its ordered requirements
 * resolved to display names (T-1-07 acceptance: "Docs export includes use cases with their ordered
 * requirements"), via the same `buildTargetLabelResolver` the requirements matrix uses.
 */
function buildUseCasesSectionHtml(projectId: string, publicView: boolean): string {
  const useCases = listUseCases(projectId);
  const labelFor = buildTargetLabelResolver(projectId);
  const useCasesForDocs: UseCaseForDocs[] = useCases.map((useCase) => {
    const requirements = listRequirements(projectId, useCase.id);
    return {
      code: useCase.code,
      name: useCase.name,
      type: useCase.type,
      priority: useCase.priority,
      status: useCase.status,
      // D-48 amendment (fix round, LOW 1): the shared HTML must not carry a use case's owner.
      owner: publicView ? null : useCase.owner,
      description: useCase.description,
      narrative: useCase.narrative,
      documentation_url: useCase.documentation_url,
      requirements: requirements.map((req) => ({
        target_label: labelFor(req),
        level: req.level,
        status: req.status,
        note: req.note,
      })),
    };
  });
  return renderUseCasesSection(useCasesForDocs);
}

export interface GenerateDocumentationHtmlOptions {
  /** D-48 amendment (fix round, LOW 1): when true (the shared route, `routes/shared.ts`), the
   * per-event identity note and the identity rule / use case owner fields are omitted -- the same
   * field set `toPublicTrackingDocument` strips from the JSON export (`document.service.ts`).
   * Defaults to false (the internal, authenticated route keeps everything). */
  public?: boolean;
}

/**
 * Renders every non-deleted event of the project, plus the identity rules and consent categories
 * sections, into one self-contained HTML document.
 */
export async function generateProjectDocumentationHtml(
  projectId: string,
  options: GenerateDocumentationHtmlOptions = {}
): Promise<string> {
  const publicView = options.public === true;
  const project: ProjectWithClient = getProjectWithClient(projectId);
  const events = listEvents(projectId);
  const allVariants = listVariantsByProject(projectId);
  const mappings = listStandardEventMappings(projectId);
  const eventNameById = new Map(events.map((event) => [event.id, event.name]));

  // The standard event a variant maps to (`StandardEventMapping.variant_id`), used both in the
  // per-event variants subsection and the "Standard event mappings" section below.
  const standardEventByVariantId = new Map(
    mappings.filter((m) => m.variant_id).map((m) => [m.variant_id as string, m.standard_event])
  );
  const variantNameById = new Map(allVariants.map((variant) => [variant.id, variant.name]));

  // One shared `EventCardBuildContext` for the whole document (WARNING 5 fix round): every
  // `buildEventCard` call inside `buildEventSectionHtml` reuses the same project-wide resolved
  // observations/findings/mappings instead of re-gathering them per event.
  const cardCtx = buildEventCardContext(projectId);
  const sections = await Promise.all(
    events.map(async (event) => {
      const { properties } = getEventWithProperties(projectId, event.id);
      const variants = allVariants.filter((v) => v.event_id === event.id);
      return buildEventSectionHtml(projectId, event, properties, variants, standardEventByVariantId, cardCtx, publicView);
    })
  );

  // Fix round 2: findings with no owning event (or an event not in this document) still count
  // toward `findings_summary`/the Findings page, so they must show up somewhere in the HTML export
  // too -- one table after the per-event sections, sharing `cardCtx` (no second findings query).
  const unattachedFindingsHtml = renderFindingsTable(buildUnattachedFindings(cardCtx), 'Open findings without an event');

  const findingsSummaryHtml = renderFindingsSummarySection(
    computeFindingsSummary(
      sections.map((x) => x.card),
      buildUnattachedFindings(cardCtx)
    ),
    (eventId) => (events.some((e) => e.id === eventId) ? `event-${eventId}` : null)
  );

  const propertiesHtml = buildPropertiesSectionHtml(projectId);
  const catalogsHtml = buildCatalogsSectionHtml(projectId);
  const identityAndConsentHtml = buildIdentityAndConsentSectionsHtml(projectId, publicView);
  const useCasesHtml = buildUseCasesSectionHtml(projectId, publicView);
  const requirementsMatrixHtml = renderRequirementsMatrixSection(computeRequirementsMatrix(projectId));

  const propertyNameByEventAndId = new Map<string, string>();
  for (const event of events) {
    const { properties } = getEventWithProperties(projectId, event.id);
    for (const link of properties) {
      propertyNameByEventAndId.set(`${event.id}:${link.property_id}`, link.payload_key?.trim() || link.property.name);
    }
  }
  const standardEventMappingsHtml = renderStandardEventMappingsSection(
    mappings.map<StandardEventMappingForDocs>((mapping) => ({
      standard_event: mapping.standard_event,
      event_name: eventNameById.get(mapping.event_id) ?? mapping.event_id,
      variant_name: mapping.variant_id ? variantNameById.get(mapping.variant_id) ?? mapping.variant_id : null,
      field_map: Object.fromEntries(
        Object.entries(mapping.field_map_json).map(([field, propertyId]) => [
          field,
          propertyId ? propertyNameByEventAndId.get(`${mapping.event_id}:${propertyId}`) ?? propertyId : null,
        ])
      ),
    }))
  );

  const toc = [findingsSummaryHtml ? '<a href="#findings-summary">Findings summary</a>' : '', ...events
    .map((event) => `<a href="#event-${escapeHtml(event.id)}">${escapeHtml(event.name)}</a>`), ...propertiesAndCatalogsToc(projectId, catalogsHtml !== '')]
    .filter(Boolean)
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
  ${findingsSummaryHtml}
  ${sections.map((x) => x.html).join('\n')}
  ${unattachedFindingsHtml}
  ${propertiesHtml}
  ${catalogsHtml}
  ${identityAndConsentHtml}
  ${standardEventMappingsHtml}
  ${useCasesHtml}
  ${requirementsMatrixHtml}
</body>
</html>`;
}

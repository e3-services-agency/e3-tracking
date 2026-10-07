/**
 * Pure Markdown renderers for the canonical document shapes (T-4-13): `eventCardToMarkdown` for
 * an `EventCard` and `useCaseToMarkdown` for a `TrackingDocumentUseCase`. The output is meant to be
 * pasted into an AI assistant or a ticket, so it favours plain headings, pipe tables and fenced
 * JSON. No DOM, server or database import, so the MCP server can reuse these later.
 */
import { describeCertificationReason } from '../certification';
import { enumLabelOr } from '../enumLabels';
import { sourceViaLabel } from '../sources';
import type { EventCard, TrackingDocumentCustomerProperty, TrackingDocumentUseCase } from './trackingDocument';
import type { PropertyKind } from '../enums';
import { groupPropertiesByCategory, formatDisplayName } from '../propertyCategory';
import { displaySampleValue, formatExampleValues } from '../examples';
import { groupFieldMap, mappingHeading } from './standardMappings';
import type { FindingsSummaryView } from './findingsSummary';
import { FAMILY_INFO, comparisonLabel, kindLabel } from '../findingsCatalog';

/** Readable example for a table cell: scalars as text, objects as a compact code span (never escaped-JSON noise). */
function exampleCell(value: unknown): string {
  const d = displaySampleValue(value);
  return d.block ? '`' + JSON.stringify(value) + '`' : d.text;
}

/** Escapes a value for use inside a Markdown pipe-table cell. */
export function mdCell(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  const text = typeof value === 'string' ? value : typeof value === 'object' ? JSON.stringify(value) : String(value);
  return text.replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ').trim();
}

function table(head: string[], rows: unknown[][]): string {
  const out = [`| ${head.join(' | ')} |`, `| ${head.map(() => '---').join(' | ')} |`];
  for (const row of rows) out.push(`| ${row.map(mdCell).join(' | ')} |`);
  return out.join('\n');
}

function jsonBlock(value: unknown): string {
  return '```json\n' + JSON.stringify(value, null, 2) + '\n```';
}

function bullet(label: string, value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  return `- ${label}: ${String(value).replace(/\r?\n/g, ' ')}`;
}

function joinLines(...items: Array<string | null>): string {
  return items.filter((s): s is string => s !== null).join('\n');
}

export function eventCardToMarkdown(card: EventCard): string {
  const out: string[] = [];
  out.push(`# Event: ${card.name}`);
  const header = joinLines(
    bullet('Business name', card.business_name),
    bullet('Class', enumLabelOr('class', card.class)),
    bullet('Implementation method', enumLabelOr('implementation', card.implementation_method)),
    bullet('dataLayer event', card.dl_event_name),
    bullet('Source', card.sources && card.sources.length > 0 ? card.sources.map((s) => sourceViaLabel(s.system, s.method)).join(', ') : null),
    bullet('Status', enumLabelOr('status', card.status)),
    bullet('Priority', enumLabelOr('priority', card.priority)),
    bullet('Business owner', card.owners?.business),
    bullet('Technical owner', card.owners?.technical),
    bullet('Grain', card.grain),
    bullet('Page', card.page),
    bullet('Trigger', card.trigger),
    bullet('Identity', card.identity_note),
    bullet(
      'Identifiers (customer_ids)',
      card.identifiers && card.identifiers.length > 0
        ? `${card.identifiers.join(', ')}${card.identifiers_derived ? ' (derived)' : ''}`
        : card.identifiers && card.identifiers_derived === false
          ? 'none, set by hand'
          : null
    )
  );
  if (header) out.push(header);
  if (card.description) out.push(card.description);
  if (card.purpose) out.push(`**Purpose:** ${card.purpose}`);
  if (card.not_suitable_for) out.push(`**Not suitable for:** ${card.not_suitable_for}`);

  const cert = card.certification;
  out.push('## Certification');
  out.push(
    !cert.applicable
      ? 'Not applicable (the event is not a custom event, or is ignored).'
      : cert.certified
        ? 'Certified.'
        : `Not certified. Reasons: ${cert.reasons.map(describeCertificationReason).join(' ') || 'none recorded.'}`
  );

  out.push('## Properties');
  if (card.properties.length === 0) {
    out.push('No properties attached.');
  } else {
    out.push(
      table(
        ['Payload key', 'Name', 'Definition', 'Type', 'Formats', 'Required', 'Role', 'Kind', 'dataLayer path', 'Bundle', 'Catalog', 'Allowed values', 'Example', 'Description'],
        card.properties.map((p) => [
          p.payload_key,
          p.name,
          p.definition_name ?? '',
          p.data_type,
          p.data_formats.map(formatDisplayName).join(', '),
          p.required ? 'yes' : 'no',
          p.role,
          enumLabelOr('property_kind', p.kind),
          p.datalayer_path === null ? 'n/a' : (p.datalayer_path ?? ''),
          p.bundle ?? '',
          p.catalog_field ?? '',
          p.allowed_values?.map((a) => a.value).join(', ') ?? '',
          exampleCell(p.example),
          p.description ?? '',
        ])
      )
    );
  }

  out.push('## Variants');
  if (card.variants.length === 0) {
    out.push('No variants (the event is a single shape).');
  } else {
    out.push(
      table(
        ['Variant', 'Conditions', 'Standard event', 'Required keys'],
        card.variants.map((v) => [
          v.name,
          v.conditions.map((c) => `${c.property_name} ${c.operator === 'equals' ? '=' : 'in'} ${c.values.join(' / ')}`).join('; '),
          v.standard_event ?? '',
          v.required_keys.join(', '),
        ])
      )
    );
  }

  if (card.standard_event_mappings.length > 0) {
    out.push('## Standard event mappings');
    for (const m of card.standard_event_mappings) {
      const g = groupFieldMap(m.field_map);
      out.push(`### ${mappingHeading(m.standard_event, card.name, m.variant_name)} (${g.summary})`);
      out.push(
        table(
          ['Bloomreach field', 'Project property'],
          [...g.mapped.map((x) => [x.field, x.property]), ...g.unmapped.map((x) => [x, 'not mapped'])]
        )
      );
    }
  }

  if (card.contexts.length > 0) {
    out.push('## Contexts');
    out.push(table(['Property', 'Payload key', 'Values'], card.contexts.map((c) => [c.property, c.payload_key, c.values.join(', ')])));
  }

  out.push('## Triggers');
  if (card.triggers.length === 0) {
    out.push('No triggers documented.');
  } else {
    out.push(table(['Title', 'Description', 'Page URL'], card.triggers.map((t) => [t.title ?? '', t.description ?? '', t.page_url ?? ''])));
  }

  out.push('## Expected payload');
  if (card.variants.length === 0) {
    // Same sample the app builds per variant (document.service.ts sampleFromAttached): every
    // attached property keyed by name, valued by its `example` (jsonSampleValueForProperty).
    const payload: Record<string, unknown> = {};
    for (const p of card.properties) payload[p.name] = p.example ?? null;
    out.push(jsonBlock(payload));
    const required = card.properties.filter((p) => p.required).map((p) => p.name);
    out.push(`Required keys: ${required.length > 0 ? required.join(', ') : 'none'}.`);
  } else {
    for (const v of card.variants) {
      out.push(`### ${v.name}`);
      out.push(jsonBlock(v.expected_payload));
    }
  }

  if (card.rules.length > 0) {
    out.push('## Rules');
    out.push(table(['Rule', 'Kind', 'Expression', 'Enabled'], card.rules.map((r) => [r.name, r.kind, r.expression_text, r.enabled ? 'yes' : 'no'])));
  }

  if (card.use_cases.length > 0) {
    out.push('## Used by use cases');
    out.push(table(['Code', 'Name', 'Level'], card.use_cases.map((u) => [u.code ?? '', u.name, enumLabelOr('level', u.level)])));
  }

  out.push('## Findings');
  const q = card.quality;
  out.push(`Open: ${q.open.error} errors, ${q.open.warning} warnings, ${q.open.info} info. Acknowledged errors: ${q.acknowledged.error}.`);
  if (card.findings.length > 0) {
    out.push(
      table(
        ['Severity', 'Kind', 'Variant', 'Property', 'Message'],
        card.findings.map((f) => [enumLabelOr('severity', f.severity), f.kind, f.variant ?? '', f.property ?? '', f.message ?? ''])
      )
    );
  }
  out.push(`Observations: ${card.freshness.observation_count}.`);

  if (card.agent_instructions) {
    out.push('## Agent instructions');
    out.push(card.agent_instructions);
  }

  return out.join('\n\n') + '\n';
}

export function useCaseToMarkdown(useCase: TrackingDocumentUseCase): string {
  const out: string[] = [];
  out.push(`# Use case: ${useCase.code ? `${useCase.code} - ` : ''}${useCase.name}`);
  const header = joinLines(bullet('Type', enumLabelOr('use_case_type', useCase.type)), bullet('Status', enumLabelOr('status', useCase.status)), bullet('Documentation', useCase.documentation_url));
  if (header) out.push(header);
  out.push('## Narrative');
  out.push(useCase.narrative?.trim() ? useCase.narrative.trim() : 'No narrative yet.');
  out.push('## Requirements');
  if (useCase.requirements.length === 0) {
    out.push('No requirements.');
  } else {
    out.push(table(['#', 'Target', 'Level', 'Status'], useCase.requirements.map((r, i) => [i + 1, r.target_label, enumLabelOr('level', r.level), enumLabelOr('status', r.status)])));
  }
  return out.join('\n\n') + '\n';
}

/**
 * Project properties as Markdown, grouped like the shared view and the HTML export (D-64, T-4-20):
 * System customer / Customer / SDK default / Event (Event split by kind), each property with its
 * named definitions nested under it.
 */
export function propertiesToMarkdown(
  properties: Array<Pick<TrackingDocumentCustomerProperty, 'category' | 'name' | 'data_type' | 'definitions'> & { kind?: PropertyKind | null }>
): string {
  const out: string[] = ['# Properties'];
  if (properties.length === 0) {
    out.push('No properties defined.');
    return out.join('\n\n') + '\n';
  }
  const renderOne = (p: (typeof properties)[number], level: string): void => {
    out.push(`${level} ${p.name} (${p.data_type})`);
    out.push(
      table(
        ['Definition', 'Description', 'Allowed values', 'Formats', 'Example'],
        p.definitions.map((d) => [
          d.name,
          d.description ?? '',
          d.allowed_values ? d.allowed_values.map((v) => v.value).join(', ') : '',
          d.formats.map(formatDisplayName).join(', '),
          formatExampleValues(d.example_values),
        ])
      )
    );
  };
  for (const group of groupPropertiesByCategory(properties)) {
    out.push(`## ${group.label} (${group.items.length})`);
    if (group.subgroups.length > 0) {
      for (const sub of group.subgroups) {
        out.push(`### ${sub.label} (${sub.items.length})`);
        for (const p of sub.items) renderOne(p, '####');
      }
    } else {
      for (const p of group.items) renderOne(p, '###');
    }
  }
  return out.join('\n\n') + '\n';
}

/** Findings summary (T-4-21): severity counts, the by-kind-family table with labels and next
 * steps, the by-comparison table with human names, and the top events. Labels only; raw ids stay
 * in the JSON/CSV exports. */
export function findingsSummaryToMarkdown(summary: FindingsSummaryView): string {
  const out: string[] = ['## Findings summary'];
  const s = summary.bySeverity;
  const a = summary.acknowledged;
  out.push(
    `${summary.total} open: ${s.error} errors, ${s.warning} warnings, ${s.info} info.` +
      (a.total > 0 ? ` Acknowledged: ${a.error} errors, ${a.warning} warnings, ${a.info} info.` : '')
  );
  if (summary.byFamily.length > 0) {
    out.push('### By kind of problem');
    out.push(
      table(
        ['Family', 'Kinds', 'Open', 'Next step'],
        summary.byFamily.map((f) => [
          FAMILY_INFO[f.family].label,
          f.kinds.map((k) => `${kindLabel(k.kind)} (${k.count})`).join(', '),
          f.total,
          FAMILY_INFO[f.family].next,
        ])
      )
    );
  }
  if (summary.byComparison.length > 0) {
    out.push('### By comparison');
    out.push(table(['Comparison', 'Error', 'Warning', 'Info'], summary.byComparison.map((c) => [comparisonLabel(c.comparison), c.error, c.warning, c.info])));
  }
  if (summary.topEvents.length > 0) {
    out.push('### Top events by open errors');
    out.push(table(['Event', 'Errors', 'All open'], summary.topEvents.map((e) => [e.name, e.errors, e.total])));
  }
  return out.join('\n\n') + '\n';
}

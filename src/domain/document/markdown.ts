/**
 * Pure Markdown renderers for the canonical document shapes (T-4-13): `eventCardToMarkdown` for
 * an `EventCard` and `useCaseToMarkdown` for a `TrackingDocumentUseCase`. The output is meant to be
 * pasted into an AI assistant or a ticket, so it favours plain headings, pipe tables and fenced
 * JSON. No DOM, server or database import, so the MCP server can reuse these later.
 */
import { describeCertificationReason } from '../certification';
import type { EventCard, TrackingDocumentUseCase } from './trackingDocument';

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
    bullet('Class', card.class),
    bullet('Implementation method', card.implementation_method),
    bullet('dataLayer event', card.dl_event_name),
    bullet('Status', card.status),
    bullet('Priority', card.priority),
    bullet('Business owner', card.owners?.business),
    bullet('Technical owner', card.owners?.technical),
    bullet('Grain', card.grain),
    bullet('Page', card.page),
    bullet('Trigger', card.trigger),
    bullet('Identity', card.identity_note)
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
        ['Payload key', 'Name', 'Definition', 'Type', 'Formats', 'Required', 'Role', 'Kind', 'dataLayer path', 'Bundle', 'Allowed values', 'Example', 'Description'],
        card.properties.map((p) => [
          p.payload_key,
          p.name,
          p.definition_name ?? '',
          p.data_type,
          p.data_formats.join(', '),
          p.required ? 'yes' : 'no',
          p.role,
          p.kind ?? '',
          p.datalayer_path ?? '',
          p.bundle ?? '',
          p.allowed_values?.map((a) => a.value).join(', ') ?? '',
          p.example ?? '',
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
    out.push(table(['Code', 'Name', 'Level'], card.use_cases.map((u) => [u.code ?? '', u.name, u.level])));
  }

  out.push('## Findings');
  const q = card.quality;
  out.push(`Open: ${q.open.error} errors, ${q.open.warning} warnings, ${q.open.info} info. Acknowledged errors: ${q.acknowledged.error}.`);
  if (card.findings.length > 0) {
    out.push(
      table(
        ['Severity', 'Kind', 'Variant', 'Property', 'Message'],
        card.findings.map((f) => [f.severity, f.kind, f.variant ?? '', f.property ?? '', f.message ?? ''])
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
  const header = joinLines(bullet('Type', useCase.type), bullet('Status', useCase.status), bullet('Documentation', useCase.documentation_url));
  if (header) out.push(header);
  out.push('## Narrative');
  out.push(useCase.narrative?.trim() ? useCase.narrative.trim() : 'No narrative yet.');
  out.push('## Requirements');
  if (useCase.requirements.length === 0) {
    out.push('No requirements.');
  } else {
    out.push(table(['#', 'Target', 'Level', 'Status'], useCase.requirements.map((r, i) => [i + 1, r.target_label, r.level, r.status ?? ''])));
  }
  return out.join('\n\n') + '\n';
}

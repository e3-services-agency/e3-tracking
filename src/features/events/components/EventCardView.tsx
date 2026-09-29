/**
 * Presentational `EventCard` renderer (D-50, T-4-03: extracted from `src/pages/EventCard.tsx`, the
 * internal, data-fetching page). Renders every `EventCard` section, in the exact order of
 * `docs/TRACKING-DOCUMENT.md`'s field table -- header/certification/expiration/freshness (grouped
 * in one Overview block), triggers (D-50: screenshots, resolved through the caller's `fileUrl`),
 * properties (incl. the generated `example`), item schemas, variants, standard event mappings,
 * contexts, coverage, rules, derived metrics / not suitable for, use cases, open findings (with the
 * `quality.acknowledged` and `quality.by_comparison` breakdowns), codegen, sdk default properties.
 *
 * No mutation, no data fetching, no auth: takes the already-loaded `card` and an `fileUrl(path)`
 * resolver so the same component renders the internal event card page
 * (`/api/projects/:id/files/*`) and the public shared view (`/api/shared/:token/files/*`,
 * `src/pages/SharedProject.tsx`). `commentsSlot` is an optional render prop for T-4-04's
 * `CommentsPanel`, rendered once near the header; `undefined` renders nothing (today, on both
 * callers, until T-4-04 wires it in).
 *
 * The internal `coverage` grid detail (row/column/cell breakdown, `GET /events/:id/coverage`) is a
 * separate, optional prop (`grid`) -- the shared view has no equivalent route and only shows the
 * `EventCard.coverage` summary counts, same as this component does when `grid` is omitted.
 */
import React from 'react';
import { summarizeCertification } from '@/src/domain/certification';
import { anyNameDiffersFromKey } from '@/src/domain/payloadKey';
import { GlossaryTerm } from '@/src/components/ui/GlossaryTerm';
import { CodeBlock } from '@/src/components/ui/CodeBlock';
import { CodegenTabs } from '@/src/features/shared/CodegenTabs';
import { TriggersBlock } from '@/src/features/shared/TriggersBlock';
import { derivedMetricsText, eventCardVisibility } from '@/src/features/shared/viewHelpers';

export interface EventCardData {
  id: string;
  name: string;
  business_name: string | null;
  class: string;
  description: string | null;
  purpose: string | null;
  page: string | null;
  trigger: string | null;
  grain: string | null;
  identity_note: string | null;
  owners: { business: string | null; technical: string | null };
  priority: string | null;
  status: string;
  certification: { applicable: boolean; certified: boolean; reasons: string[] };
  expiration: { effective: { enabled: boolean; count: number | null; units: string | null } | null; source: string | null };
  properties: {
    property_id: string;
    name: string;
    payload_key: string;
    data_type: string;
    data_formats: string[];
    required: boolean;
    role: 'normal' | 'discriminator' | 'context';
    allowed_values: { value: string; label: string | null; standard_event: string | null }[] | null;
    item_schema: { field: string; data_type: string; data_formats?: string[]; required?: boolean }[] | null;
    example: unknown;
    description: string | null;
    pii: boolean;
  }[];
  variants: {
    id: string;
    name: string;
    conditions: { property_name: string; operator: string; values: string[] }[];
    standard_event: string | null;
    expected_payload: Record<string, unknown>;
    required_keys: string[];
    expiration: { effective: { enabled: boolean; count: number | null; units: string | null } | null; source: string | null } | null;
  }[];
  standard_event_mappings: {
    standard_event: string;
    variant_id: string | null;
    variant_name: string | null;
    field_map: Record<string, string | null>;
  }[];
  contexts: { property: string; payload_key: string; values: string[] }[];
  /** D-50: additive, empty array when the event has no trigger screenshots. */
  triggers: { title: string | null; description: string | null; image_path: string | null; page_url: string | null }[];
  coverage: { rows: { variant_id: string | null; name: string }[]; columns: { name: string; values: string[] }[]; observed_count: number; unobserved_count: number };
  rules: {
    id: string;
    name: string;
    kind: string;
    message: string;
    expression_text: string;
    tolerance: { mode: string; value: number | null };
    enabled: boolean;
    variant_name: string | null;
  }[];
  derived_metrics: unknown;
  not_suitable_for: string | null;
  use_cases: { code: string | null; name: string; level: string }[];
  freshness: { last_observation_at: number | null; observation_count: number };
  quality: {
    open: { error: number; warning: number; info: number };
    /** D-42 (T-2-09 fix round): error-severity findings a person resolved by hand whose
     * fingerprint still reproduced as of the last recompute -- still block certification. */
    acknowledged: { error: number; warning: number; info: number };
    by_comparison: Record<string, { error: number; warning: number; info: number }>;
  };
  findings: {
    id: string;
    comparison: string;
    kind: string;
    severity: string;
    property: string | null;
    variant: string | null;
    rule: string | null;
    message: string | null;
    expected: unknown;
    actual: unknown;
    qa_run_id: string | null;
    first_seen: string;
    last_seen: string;
  }[];
  agent_instructions: string | null;
  codegen: { gtm: string; web_sdk: string; tracking_api: string };
  sdk_default_properties: string[];
}

export interface CoverageGridData {
  rows: { variant_id: string | null; name: string }[];
  columns: { property_id: string; name: string; payload_key: string; values: string[] }[];
  cells: { row: string; property_id: string; value: string; count: number; last_seen: number | null }[];
  unobserved: { row: string; property_id: string; value: string }[];
}

export function expirationSummary(exp: EventCardData['expiration'] | null): string {
  if (!exp || !exp.effective) return '—';
  if (!exp.effective.enabled) return `Disabled (${exp.source ?? '—'})`;
  return `${exp.effective.count} ${exp.effective.units} (${exp.source ?? '—'})`;
}

export function CertificationBadge({ certification, compact = false }: { certification: EventCardData['certification']; compact?: boolean }) {
  const label = !certification.applicable ? 'n/a' : certification.certified ? 'certified' : 'not certified';
  const color = !certification.applicable
    ? 'bg-gray-100 text-gray-600 border-gray-200'
    : certification.certified
      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
      : 'bg-red-50 text-red-800 border-red-200';
  return (
    <span
      className={`inline-block rounded-full border px-3 py-1 text-xs font-medium ${color}`}
      title={certification.reasons.length > 0 ? certification.reasons.join(', ') : undefined}
    >
      {label}
      {!compact && certification.reasons.length > 0 ? ` (${certification.reasons.join(', ')})` : ''}
    </span>
  );
}

export function CertificationBlock({ certification }: { certification: EventCardData['certification'] }) {
  const summary = summarizeCertification(certification);
  return (
    <Section title={<GlossaryTerm glossaryKey="certified">Certification</GlossaryTerm>}>
      <p className="text-sm font-medium text-gray-900">Status: {summary.status}</p>
      {summary.reasons.length > 0 && (
        <ul className="list-disc pl-5 mt-1 text-sm text-gray-700 space-y-0.5">
          {summary.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-gray-500 mt-2">{summary.change}</p>
    </Section>
  );
}

export interface EventCardViewProps {
  card: EventCardData;
  /** Resolves a stored file path (`triggers[].image_path`) to a fetchable URL: the internal page
   * passes `/api/projects/:id/files/<path>`, the shared view `/api/shared/:token/files/<path>`. */
  fileUrl: (path: string) => string;
  /** T-2-09 route detail the shared view has no equivalent for; omit it to show the coverage
   * summary counts only (`card.coverage`), same as when it's present but empty. */
  grid?: CoverageGridData | null;
  /** T-4-04 `CommentsPanel`; rendered once near the header. `undefined` renders nothing. */
  commentsSlot?: React.ReactNode;
  /** `shared` (public view) keeps only the header badge; the operator-facing Certification block is internal. Default `internal`. */
  mode?: 'internal' | 'shared';
  /** Skips the name/badge header; the shared view renders its own (collapsible, sticky) title row. */
  hideHeader?: boolean;
  /** Rendered next to the certification badge in the header (T-4-16: the comment count button). */
  headerActions?: React.ReactNode;
}

export function EventCardView({ card, fileUrl, grid, commentsSlot, mode = 'internal', hideHeader = false, headerActions }: EventCardViewProps) {
  const showNames = anyNameDiffersFromKey(card.properties);
  const shared = mode === 'shared';
  const visible = eventCardVisibility(card);
  return (
    <div className="space-y-6">
      {!hideHeader && (
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{card.name}</h1>
          {card.business_name && <p className="text-sm text-gray-500 mt-1">{card.business_name}</p>}
        </div>
        <div className="flex items-center gap-2">
          {headerActions}
          <CertificationBadge certification={card.certification} />
        </div>
      </div>
      )}

      {mode === 'internal' && <CertificationBlock certification={card.certification} />}

      {commentsSlot}

      <Section title="Overview">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          {[
            ['Class', card.class, true],
            ['Status', card.status, true],
            ['Priority', card.priority ?? '—', true],
            ['Grain', card.grain ?? '—', true],
            ['Page', card.page ?? '—', true],
            ['Trigger', card.trigger ?? '—', true],
            ['Identity note', card.identity_note ?? '—', !shared],
            ['Owner (business)', card.owners.business ?? '—', !shared],
            ['Owner (technical)', card.owners.technical ?? '—', !shared],
            ['Purpose', card.purpose ?? '—', true],
            ['Expiration', expirationSummary(card.expiration), true],
            [
              'Freshness',
              `${card.freshness.observation_count} observation(s)${
                card.freshness.last_observation_at ? `, last ${new Date(card.freshness.last_observation_at * 1000).toLocaleString()}` : ''
              }`,
              true,
            ],
          ]
            .filter(([, value, show]) => show && !(shared && value === '—'))
            .map(([label, value]) => (
              <Field key={label as string} label={label as string} value={value as string} />
            ))}
        </dl>
        {card.description && <p className="text-sm text-gray-700 mt-3">{card.description}</p>}
        {card.agent_instructions && (
          <p className="text-xs text-gray-500 mt-2 italic">Agent instructions: {card.agent_instructions}</p>
        )}
      </Section>

      {card.triggers.length > 0 && (
        <Section title={`Triggers (${card.triggers.length})`}>
          <TriggersBlock triggers={card.triggers} fileUrl={fileUrl} />
        </Section>
      )}

      {(!shared || card.properties.length > 0) && (
      <Section title={`Properties (${card.properties.length})`}>
        <Table
          head={[
            'Payload key',
            ...(showNames ? ['Name'] : []),
            'Type', 'Formats', 'Role', 'Required', 'Allowed values', 'PII', 'Description', 'Example',
          ]}
          rows={card.properties.map((p) => [
            p.payload_key,
            ...(showNames ? [p.name] : []),
            p.data_type,
            p.data_formats.join(', ') || '—',
            p.role,
            p.required ? 'yes' : 'no',
            p.allowed_values ? p.allowed_values.map((v) => v.value).join(', ') : '—',
            p.pii ? 'yes' : 'no',
            p.description ?? '—',
            JSON.stringify(p.example ?? null),
          ])}
        />
      </Section>
      )}

      {card.properties.some((p) => p.item_schema) && (
        <Section title="Item schemas">
          {card.properties
            .filter((p) => p.item_schema)
            .map((p) => (
              <div key={p.property_id} className="mb-4">
                <h4 className="text-sm font-semibold text-gray-800 mb-1">{p.name}</h4>
                <Table
                  head={['Field', 'Type', 'Formats', 'Required']}
                  rows={(p.item_schema ?? []).map((f) => [f.field, f.data_type, (f.data_formats ?? []).join(', ') || '—', f.required ? 'yes' : 'no'])}
                />
              </div>
            ))}
        </Section>
      )}

      {(!shared || visible.variants) && (
      <Section title={`Variants (${card.variants.length})`}>
        {card.variants.length === 0 && <p className="text-sm text-gray-500">No variants.</p>}
        {card.variants.map((v) => (
          <div key={v.id} className="mb-4 border rounded-md p-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-sm font-semibold text-gray-800">{v.name}</h4>
              <span className="text-xs text-gray-500">{v.standard_event ? `standard event: ${v.standard_event}` : ''}</span>
            </div>
            <p className="text-xs text-gray-500 mb-2">
              {v.conditions.map((c) => `${c.property_name} ${c.operator} ${c.values.join('/')}`).join(', ')}
            </p>
            {(!shared || v.required_keys.length > 0) && (
              <p className="text-xs text-gray-500 mb-1">Required keys: {v.required_keys.join(', ') || '—'}</p>
            )}
            {(!shared || expirationSummary(v.expiration) !== '—') && (
              <p className="text-xs text-gray-500 mb-1">Expiration: {expirationSummary(v.expiration)}</p>
            )}
            <p className="text-xs font-semibold text-gray-700 mb-1">Expected payload</p>
            <CodeBlock code={JSON.stringify(v.expected_payload, null, 2)} language="json" />
          </div>
        ))}
      </Section>
      )}

      {(!shared || visible.standardEventMappings) && (
      <Section title={`Standard event mappings (${card.standard_event_mappings.length})`}>
        {card.standard_event_mappings.length === 0 && <p className="text-sm text-gray-500">Not mapped to a standard event.</p>}
        {card.standard_event_mappings.length > 0 && (
          <Table
            head={['Standard event', 'Variant', 'Field map']}
            rows={card.standard_event_mappings.map((m) => [
              m.standard_event,
              m.variant_name ?? 'all',
              Object.entries(m.field_map)
                .map(([field, propertyName]) => `${field} -> ${propertyName ?? '—'}`)
                .join(', ') || '—',
            ])}
          />
        )}
      </Section>
      )}

      {card.contexts.length > 0 && (
        <Section title="Contexts">
          <Table head={['Property', 'Payload key', 'Values']} rows={card.contexts.map((c) => [c.property, c.payload_key, c.values.join(', ')])} />
        </Section>
      )}

      {(!shared || card.coverage.observed_count + card.coverage.unobserved_count > 0) && (
      <Section title="Coverage">
        <p className="text-sm text-gray-700 mb-2">
          {card.coverage.observed_count} observed cell(s), {card.coverage.unobserved_count} unobserved.
        </p>
        {grid && grid.columns.length > 0 && (
          <Table
            head={['Variant', ...grid.columns.flatMap((c) => c.values.map((v) => `${c.name}=${v}`))]}
            rows={grid.rows.map((row) => {
              const rowKey = row.variant_id ?? 'base';
              return [
                row.name,
                ...grid.columns.flatMap((c) =>
                  c.values.map((v) => {
                    const cell = grid.cells.find((x) => x.row === rowKey && x.property_id === c.property_id && x.value === v);
                    return cell ? `${cell.count}` : '0';
                  })
                ),
              ];
            })}
          />
        )}
      </Section>
      )}

      {(!shared || visible.rules) && (
      <Section title={`Rules (${card.rules.length})`}>
        {card.rules.length === 0 && <p className="text-sm text-gray-500">No rules.</p>}
        {card.rules.length > 0 && (
          <Table
            head={['Name', 'Kind', 'Scope', 'Message', 'Expression', 'Tolerance', 'Enabled']}
            rows={card.rules.map((r) => [
              r.name,
              r.kind,
              r.variant_name ?? 'all',
              r.message,
              r.expression_text,
              r.tolerance.mode === 'none' ? 'none' : `${r.tolerance.mode}${r.tolerance.value != null ? `: ${r.tolerance.value}` : ''}`,
              r.enabled ? 'yes' : 'no',
            ])}
          />
        )}
      </Section>
      )}

      {(!shared || visible.derivedMetrics || visible.notSuitableFor) && (
      <Section title="Derived metrics / not suitable for">
        {(!shared || visible.derivedMetrics) && <Field label="Derived metrics" value={derivedMetricsText(card.derived_metrics)} />}
        {(!shared || visible.notSuitableFor) && (
          <div className="mt-2">
            <Field label="Not suitable for" value={card.not_suitable_for ?? '—'} />
          </div>
        )}
      </Section>
      )}

      {(!shared || visible.useCases) && (
      <Section title={`Use cases (${card.use_cases.length})`}>
        {card.use_cases.length === 0 && <p className="text-sm text-gray-500">Not referenced by any use case.</p>}
        {card.use_cases.length > 0 && (
          <Table head={['Code', 'Name', 'Level']} rows={card.use_cases.map((u) => [u.code ?? '—', u.name, u.level])} />
        )}
      </Section>
      )}

      {(!shared || card.findings.length > 0) && (
      <Section
        title={`Open findings (${card.findings.length}) — error ${card.quality.open.error}, warning ${card.quality.open.warning}, info ${card.quality.open.info}${
          card.quality.acknowledged.error + card.quality.acknowledged.warning + card.quality.acknowledged.info > 0
            ? `; acknowledged: error ${card.quality.acknowledged.error}, warning ${card.quality.acknowledged.warning}, info ${card.quality.acknowledged.info}`
            : ''
        }`}
      >
        {Object.keys(card.quality.by_comparison).length > 0 && (
          <Table
            head={['Comparison', 'Error', 'Warning', 'Info']}
            rows={Object.entries(card.quality.by_comparison).map(([comparison, counts]) => [
              comparison,
              counts.error,
              counts.warning,
              counts.info,
            ])}
          />
        )}
        {card.findings.length === 0 && <p className="text-sm text-gray-500 mt-3">No open findings.</p>}
        {card.findings.length > 0 && (
          <div className="mt-3">
            {shared ? (
              <Table
                head={['Severity', 'Kind', 'Property / variant', 'Message']}
                rows={card.findings.map((f) => [
                  f.severity,
                  f.kind,
                  [f.property, f.variant].filter(Boolean).join(' / ') || '—',
                  f.message ?? '—',
                ])}
              />
            ) : (
            <Table
              head={['Severity', 'Kind', 'Comparison', 'Rule', 'Property', 'Variant', 'Message', 'Expected', 'Actual', 'QA run', 'First seen', 'Last seen']}
              rows={card.findings.map((f) => [
                f.severity,
                f.kind,
                f.comparison,
                f.rule ?? '—',
                f.property ?? '—',
                f.variant ?? '—',
                f.message ?? '—',
                JSON.stringify(f.expected ?? null),
                JSON.stringify(f.actual ?? null),
                f.qa_run_id ?? '—',
                new Date(f.first_seen).toLocaleString(),
                new Date(f.last_seen).toLocaleString(),
              ])}
            />
            )}
          </div>
        )}
      </Section>
      )}

      {(!shared || Object.values(card.codegen).some((code) => code.trim() !== '')) && (
      <Section title="Implementation">
        <CodegenTabs codegen={card.codegen} defaultOpen={!shared} />
      </Section>
      )}

      {(!shared || visible.sdkDefaultProperties) && (
      <Section title="SDK default properties">
        <p className="text-sm text-gray-700">{card.sdk_default_properties.join(', ') || '—'}</p>
      </Section>
      )}
    </div>
  );
}

export function Section({ title, children }: { title: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

export function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

export function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-gray-50 border-b">
          <tr>
            {head.map((h) => (
              <th key={h} className="px-3 py-2 font-medium text-gray-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j} className="px-3 py-2 text-gray-700 max-w-xs truncate" title={String(cell)}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={head.length} className="px-3 py-4 text-center text-gray-400">
                —
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

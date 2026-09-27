/**
 * Event card page (T-2-09, T-2-09 fix round, D-07 simplified UI, plan "Event card and tracking
 * document"): renders every `EventCard` section, in the exact order of `docs/TRACKING-DOCUMENT.md`'s
 * field table -- header/certification/expiration/freshness (grouped in one Overview block, itself
 * first in that table), properties, item schemas, variants, standard event mappings, contexts,
 * coverage, rules, derived metrics / not suitable for, open findings (with the `quality.acknowledged`
 * and `quality.by_comparison` breakdowns), use cases, codegen, sdk default properties. Plain tables,
 * no design work.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

interface EventCardData {
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
  }[];
  agent_instructions: string | null;
  codegen: { gtm: string; web_sdk: string; tracking_api: string };
  sdk_default_properties: string[];
}

interface CoverageGridData {
  rows: { variant_id: string | null; name: string }[];
  columns: { property_id: string; name: string; payload_key: string; values: string[] }[];
  cells: { row: string; property_id: string; value: string; count: number; last_seen: number | null }[];
  unobserved: { row: string; property_id: string; value: string }[];
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function expirationSummary(exp: EventCardData['expiration'] | null): string {
  if (!exp || !exp.effective) return '—';
  if (!exp.effective.enabled) return `Disabled (${exp.source ?? '—'})`;
  return `${exp.effective.count} ${exp.effective.units} (${exp.source ?? '—'})`;
}

function CertificationBadge({ certification }: { certification: EventCardData['certification'] }) {
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
      {certification.reasons.length > 0 ? ` (${certification.reasons.join(', ')})` : ''}
    </span>
  );
}

export function EventCard({ eventId, onBack }: { eventId: string; onBack: () => void }) {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const setEventCardEventId = useStore((s) => s.setEventCardEventId);
  const [card, setCard] = useState<EventCardData | null>(null);
  const [grid, setGrid] = useState<CoverageGridData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId || !eventId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/events/${eventId}/card`);
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to load this event card.');
        setCard(null);
        return;
      }
      setCard(data);
      const gridRes = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/events/${eventId}/coverage`);
      const gridData = await parseJson(gridRes);
      if (gridRes.ok) setGrid(gridData);
    } catch {
      setError('Failed to load this event card.');
      setCard(null);
    } finally {
      setLoading(false);
    }
  }, [hasValidProjectContext, activeProjectId, eventId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleBack = () => {
    setEventCardEventId(null);
    onBack();
  };

  if (!hasValidProjectContext || !activeProjectId) {
    return <div className="p-8 text-sm text-gray-500">Select a project first.</div>;
  }

  return (
    <div className="flex-1 flex flex-col h-full">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <button type="button" onClick={handleBack} className="text-sm text-[var(--brand-primary)] hover:underline mb-1">
            &larr; Back to Events
          </button>
          <h1 className="text-2xl font-bold text-gray-900">{card ? card.name : 'Event card'}</h1>
          {card?.business_name && <p className="text-sm text-gray-500 mt-1">{card.business_name}</p>}
        </div>
        {card && <CertificationBadge certification={card.certification} />}
      </div>

      <div className="p-8 flex-1 overflow-y-auto space-y-6">
        {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{error}</div>}
        {loading && <div className="text-sm text-gray-400">Loading…</div>}

        {card && (
          <>
            <Section title="Overview">
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <Field label="Class" value={card.class} />
                <Field label="Status" value={card.status} />
                <Field label="Priority" value={card.priority ?? '—'} />
                <Field label="Grain" value={card.grain ?? '—'} />
                <Field label="Page" value={card.page ?? '—'} />
                <Field label="Trigger" value={card.trigger ?? '—'} />
                <Field label="Identity note" value={card.identity_note ?? '—'} />
                <Field label="Owner (business)" value={card.owners.business ?? '—'} />
                <Field label="Owner (technical)" value={card.owners.technical ?? '—'} />
                <Field label="Purpose" value={card.purpose ?? '—'} />
                <Field label="Expiration" value={expirationSummary(card.expiration)} />
                <Field
                  label="Freshness"
                  value={`${card.freshness.observation_count} observation(s)${
                    card.freshness.last_observation_at ? `, last ${new Date(card.freshness.last_observation_at * 1000).toLocaleString()}` : ''
                  }`}
                />
              </dl>
              {card.description && <p className="text-sm text-gray-700 mt-3">{card.description}</p>}
              {card.agent_instructions && (
                <p className="text-xs text-gray-500 mt-2 italic">Agent instructions: {card.agent_instructions}</p>
              )}
            </Section>

            <Section title={`Properties (${card.properties.length})`}>
              <Table
                head={['Name', 'Payload key', 'Type', 'Formats', 'Role', 'Required', 'Allowed values', 'PII', 'Description']}
                rows={card.properties.map((p) => [
                  p.name,
                  p.payload_key,
                  p.data_type,
                  p.data_formats.join(', ') || '—',
                  p.role,
                  p.required ? 'yes' : 'no',
                  p.allowed_values ? p.allowed_values.map((v) => v.value).join(', ') : '—',
                  p.pii ? 'yes' : 'no',
                  p.description ?? '—',
                ])}
              />
            </Section>

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
                  <p className="text-xs text-gray-500 mb-1">Required keys: {v.required_keys.join(', ') || '—'}</p>
                  <p className="text-xs text-gray-500 mb-1">Expiration: {expirationSummary(v.expiration)}</p>
                  <pre className="bg-gray-50 border rounded p-2 text-xs overflow-x-auto">{JSON.stringify(v.expected_payload, null, 2)}</pre>
                </div>
              ))}
            </Section>

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

            {card.contexts.length > 0 && (
              <Section title="Contexts">
                <Table head={['Property', 'Payload key', 'Values']} rows={card.contexts.map((c) => [c.property, c.payload_key, c.values.join(', ')])} />
              </Section>
            )}

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

            <Section title="Derived metrics / not suitable for">
              <Field label="Derived metrics" value={card.derived_metrics ? JSON.stringify(card.derived_metrics) : '—'} />
              <div className="mt-2">
                <Field label="Not suitable for" value={card.not_suitable_for ?? '—'} />
              </div>
            </Section>

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
                  <Table
                    head={['Severity', 'Kind', 'Comparison', 'Rule', 'Property', 'Variant', 'Message', 'Expected', 'Actual']}
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
                    ])}
                  />
                </div>
              )}
            </Section>

            <Section title={`Use cases (${card.use_cases.length})`}>
              {card.use_cases.length === 0 && <p className="text-sm text-gray-500">Not referenced by any use case.</p>}
              {card.use_cases.length > 0 && (
                <Table head={['Code', 'Name', 'Level']} rows={card.use_cases.map((u) => [u.code ?? '—', u.name, u.level])} />
              )}
            </Section>

            <Section title="Codegen">
              <CodeBlock label="GTM / dataLayer" code={card.codegen.gtm} />
              <CodeBlock label="Bloomreach Web SDK" code={card.codegen.web_sdk} />
              <CodeBlock label="Bloomreach Tracking API" code={card.codegen.tracking_api} />
            </Section>

            <Section title="SDK default properties">
              <p className="text-sm text-gray-700">{card.sdk_default_properties.join(', ') || '—'}</p>
            </Section>
          </>
        )}
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-lg border shadow-sm p-4">
      <h2 className="text-sm font-semibold text-gray-900 mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-gray-500">{label}</dt>
      <dd className="font-medium text-gray-900">{value}</dd>
    </div>
  );
}

function Table({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
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

function CodeBlock({ label, code }: { label: string; code: string }) {
  return (
    <div className="mb-3">
      <h4 className="text-xs font-semibold text-gray-700 mb-1">{label}</h4>
      <pre className="bg-gray-50 border rounded p-2 text-xs overflow-x-auto whitespace-pre-wrap">{code}</pre>
    </div>
  );
}

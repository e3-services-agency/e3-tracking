import { SeverityBadge } from '@/src/components/ui/badges';
/**
 * Rules section for the event editor (D-30, D-31, T-2-07, D-07 simplified UI): a table of the
 * event's rules (name, kind, scope, severity, message, enabled, delete), "Apply template" buttons
 * that only show every seed template with whether it currently applies (and why not, when it
 * doesn't), and a structured create form limited to the event's own linked properties and their
 * list fields — one shape per `RuleKind` (D-30's grammar), no free-form JSON editing.
 * `cross_event` rules (currently only `purchase_items_total`) are created via their template only;
 * building a cross-event join by hand is out of scope for this simplified form.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, Loader2, Sparkles } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { RULE_BOUND_CHECKS, RULE_COMPARATORS, RULE_SEVERITIES, RULE_TOLERANCE_MODES } from '@/src/domain/enums';

export interface RuleLinkedProperty {
  property_id: string;
  name: string;
  data_type: string;
  item_schema_json?: { field: string; data_type: string }[] | null;
}

interface RuleVariantOption {
  id: string;
  name: string;
}

interface RuleRow {
  id: string;
  event_id: string;
  variant_id: string | null;
  kind: string;
  name: string;
  message: string;
  expression_json: unknown;
  tolerance_mode: string;
  tolerance_value: number | null;
  report_kind: string;
  severity: string;
  template_key: string | null;
  enabled: boolean;
  status?: 'ok' | 'broken';
}

interface RuleTemplateSummary {
  key: string;
  name: string;
  description: string;
  applicable: boolean;
  /** T-2-05 fix round (T-2-07 review WARNING 3): why `applicable` is `false`, from the DAL's
   * `RuleTemplate.reason`; `null` when `applicable` is `true`. */
  reason: string | null;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

const MANUAL_KINDS = ['arithmetic', 'membership', 'bound'] as const;
type ManualKind = (typeof MANUAL_KINDS)[number];

function emptyForm() {
  return {
    kind: 'membership' as ManualKind,
    name: '',
    message: '',
    variantId: '',
    severity: 'error',
    toleranceMode: 'none',
    toleranceValue: '',
    // membership
    needlePropertyId: '',
    haystackPropertyId: '',
    haystackField: '',
    // bound
    subjectPropertyId: '',
    boundCheck: 'lt' as (typeof RULE_BOUND_CHECKS)[number],
    boundConstant: '',
    // arithmetic
    leftMode: 'property' as 'property' | 'sum_list',
    leftPropertyId: '',
    leftListPropertyId: '',
    leftFieldA: '',
    leftFieldB: '',
    comparator: 'eq' as (typeof RULE_COMPARATORS)[number],
    rightPropertyId: '',
  };
}

function listFields(property: RuleLinkedProperty | undefined): string[] {
  return property?.item_schema_json?.map((f) => f.field) ?? [];
}

export function RulesSection({
  projectId,
  eventId,
  properties,
}: {
  projectId: string;
  eventId: string;
  properties: RuleLinkedProperty[];
}) {
  const [rules, setRules] = useState<RuleRow[]>([]);
  const [templates, setTemplates] = useState<RuleTemplateSummary[]>([]);
  const [variants, setVariants] = useState<RuleVariantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [creating, setCreating] = useState(false);
  const [applyingTemplate, setApplyingTemplate] = useState<string | null>(null);
  // T-2-05 fix round (T-2-07 review WARNING 3, D-07 simplified UI): the non-applicable templates
  // collapse behind this toggle instead of always showing as disabled buttons.
  const [showNotApplicable, setShowNotApplicable] = useState(false);

  const load = useCallback(async () => {
    const [rulesRes, templatesRes, variantsRes] = await Promise.all([
      fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}/rules`),
      fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}/rule-templates`),
      fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}/variants`),
    ]);
    const rulesData = await parseJson(rulesRes);
    if (rulesRes.ok) setRules(Array.isArray(rulesData) ? rulesData : []);
    const templatesData = await parseJson(templatesRes);
    if (templatesRes.ok) setTemplates(Array.isArray(templatesData) ? templatesData : []);
    const variantsData = await parseJson(variantsRes);
    if (variantsRes.ok) setVariants(Array.isArray(variantsData) ? variantsData.map((v: any) => ({ id: v.id, name: v.name })) : []);
    setLoading(false);
  }, [projectId, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const propertyById = (id: string) => properties.find((p) => p.property_id === id);
  const listProperties = properties.filter((p) => p.data_type === 'array' && (p.item_schema_json?.length ?? 0) > 0);

  const handleApplyTemplate = async (key: string) => {
    setApplyingTemplate(key);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}/rules/from-template/${key}`, {
        method: 'POST',
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to apply template.');
        return;
      }
      await load();
    } finally {
      setApplyingTemplate(null);
    }
  };

  const handleToggleEnabled = async (rule: RuleRow) => {
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/rules/${rule.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled: !rule.enabled }),
    });
    if (res.ok) await load();
  };

  const handleDelete = async (ruleId: string) => {
    if (!window.confirm('Delete this rule?')) return;
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/rules/${ruleId}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) await load();
  };

  function buildExpression(): { expression_json: unknown; kind: string } | null {
    if (form.kind === 'membership') {
      if (!form.needlePropertyId || !form.haystackPropertyId || !form.haystackField) return null;
      return {
        kind: 'membership',
        expression_json: {
          kind: 'membership',
          needle: { ref: 'property', property_id: form.needlePropertyId },
          haystack: { property_id: form.haystackPropertyId, field: form.haystackField },
        },
      };
    }
    if (form.kind === 'bound') {
      if (!form.subjectPropertyId) return null;
      const needsBound = (RULE_COMPARATORS as readonly string[]).includes(form.boundCheck);
      if (needsBound && form.boundConstant.trim() === '') return null;
      return {
        kind: 'bound',
        expression_json: {
          kind: 'bound',
          subject: { ref: 'property', property_id: form.subjectPropertyId },
          check: form.boundCheck,
          ...(needsBound ? { bound: { ref: 'constant', value: Number(form.boundConstant) } } : {}),
        },
      };
    }
    // arithmetic
    if (!form.rightPropertyId) return null;
    let left: unknown;
    if (form.leftMode === 'property') {
      if (!form.leftPropertyId) return null;
      left = { ref: 'property', property_id: form.leftPropertyId };
    } else {
      if (!form.leftListPropertyId || !form.leftFieldA) return null;
      const fieldA = { ref: 'list_field', property_id: form.leftListPropertyId, field: form.leftFieldA };
      const of = form.leftFieldB
        ? { ref: 'product', left: fieldA, right: { ref: 'list_field', property_id: form.leftListPropertyId, field: form.leftFieldB } }
        : fieldA;
      left = { ref: 'aggregate', fn: 'sum', of };
    }
    return {
      kind: 'arithmetic',
      expression_json: {
        kind: 'arithmetic',
        left,
        comparator: form.comparator,
        right: { ref: 'property', property_id: form.rightPropertyId },
      },
    };
  }

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError('Rule name is required.');
      return;
    }
    const built = buildExpression();
    if (!built) {
      setError('Fill in every field this rule kind needs before creating it.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const body = {
        variant_id: form.variantId || null,
        kind: built.kind,
        name: form.name.trim(),
        message: form.message.trim() || undefined,
        expression_json: built.expression_json,
        tolerance_mode: built.kind === 'arithmetic' ? form.toleranceMode : 'none',
        tolerance_value:
          built.kind === 'arithmetic' && (form.toleranceMode === 'absolute' || form.toleranceMode === 'percent')
            ? Number(form.toleranceValue)
            : null,
        severity: form.severity,
      };
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}/rules`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to create rule.');
        return;
      }
      setForm(emptyForm());
      await load();
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return <div className="text-sm text-gray-500 border-t pt-4">Loading rules…</div>;
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold text-gray-900">Rules</h3>

      {templates.length > 0 && (
        <div className="space-y-1">
          {(() => {
            const applicableTemplates = templates.filter((t) => t.applicable);
            const notApplicableTemplates = templates.filter((t) => !t.applicable);
            return (
              <>
                {applicableTemplates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {applicableTemplates.map((t) => (
                      <Button
                        key={t.key}
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={applyingTemplate === t.key}
                        title={t.description}
                        onClick={() => void handleApplyTemplate(t.key)}
                        className="gap-1"
                      >
                        {applyingTemplate === t.key ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                        {t.name}
                      </Button>
                    ))}
                  </div>
                )}
                {notApplicableTemplates.length > 0 && (
                  <div className="text-xs">
                    <button
                      type="button"
                      onClick={() => setShowNotApplicable((v) => !v)}
                      className="text-gray-500 hover:text-gray-700 underline"
                    >
                      {showNotApplicable ? 'Hide' : 'Show'} {notApplicableTemplates.length} not-applicable template
                      {notApplicableTemplates.length === 1 ? '' : 's'}
                    </button>
                    {showNotApplicable && (
                      <ul className="mt-1 space-y-1 text-gray-500">
                        {notApplicableTemplates.map((t) => (
                          <li key={t.key}>
                            <span className="font-medium text-gray-600">{t.name}:</span> {t.reason ?? t.description}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      )}

      <table className="w-full text-left text-xs border">
        <thead className="bg-gray-50 border-b">
          <tr>
            <th className="px-3 py-2 font-medium text-gray-500">Name</th>
            <th className="px-3 py-2 font-medium text-gray-500">Kind</th>
            <th className="px-3 py-2 font-medium text-gray-500">Scope</th>
            <th className="px-3 py-2 font-medium text-gray-500">Severity</th>
            <th className="px-3 py-2 font-medium text-gray-500">Message</th>
            <th className="px-3 py-2 font-medium text-gray-500">Enabled</th>
            <th className="px-3 py-2 font-medium text-gray-500 w-10" />
          </tr>
        </thead>
        <tbody className="divide-y">
          {rules.map((r) => (
            <tr key={r.id} className={r.status === 'broken' ? 'bg-red-50' : undefined}>
              <td className="px-3 py-2 font-medium text-gray-900">
                {r.name}
                {r.status === 'broken' && <span className="ml-1 text-red-600" title="A property this rule references is no longer linked.">⚠</span>}
              </td>
              <td className="px-3 py-2 text-gray-600 font-mono">{r.kind}</td>
              <td className="px-3 py-2 text-gray-600">{r.variant_id ? variants.find((v) => v.id === r.variant_id)?.name ?? r.variant_id : 'event'}</td>
              <td className="px-3 py-2"><SeverityBadge severity={r.severity} /></td>
              <td className="px-3 py-2 text-gray-600 max-w-xs truncate" title={r.message}>{r.message}</td>
              <td className="px-3 py-2">
                <input type="checkbox" checked={r.enabled} onChange={() => void handleToggleEnabled(r)} />
              </td>
              <td className="px-3 py-2">
                <button type="button" onClick={() => void handleDelete(r.id)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
          {rules.length === 0 && (
            <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-500">No rules yet.</td></tr>
          )}
        </tbody>
      </table>

      <div className="border rounded-md p-3 space-y-2 bg-gray-50">
        <div className="text-xs font-medium text-gray-700">Add rule</div>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={form.kind}
            onChange={(e) => setForm((f) => ({ ...emptyForm(), kind: e.target.value as ManualKind, name: f.name }))}
            className="h-8 rounded border border-gray-300 px-2 text-xs"
          >
            {MANUAL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select>
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="rule name" className="h-8 w-40 text-xs" />
          <select value={form.variantId} onChange={(e) => setForm((f) => ({ ...f, variantId: e.target.value }))} className="h-8 rounded border border-gray-300 px-2 text-xs">
            <option value="">scope: whole event</option>
            {variants.map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
          </select>
          <select value={form.severity} onChange={(e) => setForm((f) => ({ ...f, severity: e.target.value }))} className="h-8 rounded border border-gray-300 px-2 text-xs">
            {RULE_SEVERITIES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {form.kind === 'membership' && (
          <div className="flex flex-wrap gap-2 items-center">
            <select value={form.needlePropertyId} onChange={(e) => setForm((f) => ({ ...f, needlePropertyId: e.target.value }))} className="h-8 rounded border border-gray-300 px-2 text-xs">
              <option value="">needle property…</option>
              {properties.map((p) => <option key={p.property_id} value={p.property_id}>{p.name}</option>)}
            </select>
            <span className="text-gray-500">must be present in</span>
            <select
              value={form.haystackPropertyId}
              onChange={(e) => setForm((f) => ({ ...f, haystackPropertyId: e.target.value, haystackField: '' }))}
              className="h-8 rounded border border-gray-300 px-2 text-xs"
            >
              <option value="">list property…</option>
              {listProperties.map((p) => <option key={p.property_id} value={p.property_id}>{p.name}</option>)}
            </select>
            <select value={form.haystackField} onChange={(e) => setForm((f) => ({ ...f, haystackField: e.target.value }))} className="h-8 rounded border border-gray-300 px-2 text-xs" disabled={!form.haystackPropertyId}>
              <option value="">field…</option>
              {listFields(propertyById(form.haystackPropertyId)).map((field) => <option key={field} value={field}>{field}</option>)}
            </select>
          </div>
        )}

        {form.kind === 'bound' && (
          <div className="flex flex-wrap gap-2 items-center">
            <select value={form.subjectPropertyId} onChange={(e) => setForm((f) => ({ ...f, subjectPropertyId: e.target.value }))} className="h-8 rounded border border-gray-300 px-2 text-xs">
              <option value="">subject property…</option>
              {properties.map((p) => <option key={p.property_id} value={p.property_id}>{p.name}</option>)}
            </select>
            <select value={form.boundCheck} onChange={(e) => setForm((f) => ({ ...f, boundCheck: e.target.value as (typeof RULE_BOUND_CHECKS)[number] }))} className="h-8 rounded border border-gray-300 px-2 text-xs">
              {RULE_BOUND_CHECKS.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            {(RULE_COMPARATORS as readonly string[]).includes(form.boundCheck) && (
              <Input
                type="number"
                value={form.boundConstant}
                onChange={(e) => setForm((f) => ({ ...f, boundConstant: e.target.value }))}
                placeholder="bound value"
                className="h-8 w-28 text-xs"
              />
            )}
          </div>
        )}

        {form.kind === 'arithmetic' && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2 items-center">
              <select value={form.leftMode} onChange={(e) => setForm((f) => ({ ...f, leftMode: e.target.value as 'property' | 'sum_list' }))} className="h-8 rounded border border-gray-300 px-2 text-xs">
                <option value="property">left: property</option>
                <option value="sum_list">left: sum of a list property's field(s)</option>
              </select>
              {form.leftMode === 'property' ? (
                <select value={form.leftPropertyId} onChange={(e) => setForm((f) => ({ ...f, leftPropertyId: e.target.value }))} className="h-8 rounded border border-gray-300 px-2 text-xs">
                  <option value="">property…</option>
                  {properties.map((p) => <option key={p.property_id} value={p.property_id}>{p.name}</option>)}
                </select>
              ) : (
                <>
                  <select
                    value={form.leftListPropertyId}
                    onChange={(e) => setForm((f) => ({ ...f, leftListPropertyId: e.target.value, leftFieldA: '', leftFieldB: '' }))}
                    className="h-8 rounded border border-gray-300 px-2 text-xs"
                  >
                    <option value="">list property…</option>
                    {listProperties.map((p) => <option key={p.property_id} value={p.property_id}>{p.name}</option>)}
                  </select>
                  <select value={form.leftFieldA} onChange={(e) => setForm((f) => ({ ...f, leftFieldA: e.target.value }))} className="h-8 rounded border border-gray-300 px-2 text-xs" disabled={!form.leftListPropertyId}>
                    <option value="">field…</option>
                    {listFields(propertyById(form.leftListPropertyId)).map((field) => <option key={field} value={field}>{field}</option>)}
                  </select>
                  <span className="text-gray-500 text-xs">× (optional)</span>
                  <select value={form.leftFieldB} onChange={(e) => setForm((f) => ({ ...f, leftFieldB: e.target.value }))} className="h-8 rounded border border-gray-300 px-2 text-xs" disabled={!form.leftListPropertyId}>
                    <option value="">field…</option>
                    {listFields(propertyById(form.leftListPropertyId)).map((field) => <option key={field} value={field}>{field}</option>)}
                  </select>
                </>
              )}
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <select value={form.comparator} onChange={(e) => setForm((f) => ({ ...f, comparator: e.target.value as (typeof RULE_COMPARATORS)[number] }))} className="h-8 rounded border border-gray-300 px-2 text-xs">
                {RULE_COMPARATORS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select value={form.rightPropertyId} onChange={(e) => setForm((f) => ({ ...f, rightPropertyId: e.target.value }))} className="h-8 rounded border border-gray-300 px-2 text-xs">
                <option value="">right: property…</option>
                {properties.map((p) => <option key={p.property_id} value={p.property_id}>{p.name}</option>)}
              </select>
              <select value={form.toleranceMode} onChange={(e) => setForm((f) => ({ ...f, toleranceMode: e.target.value }))} className="h-8 rounded border border-gray-300 px-2 text-xs">
                {RULE_TOLERANCE_MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
              {(form.toleranceMode === 'absolute' || form.toleranceMode === 'percent') && (
                <Input type="number" value={form.toleranceValue} onChange={(e) => setForm((f) => ({ ...f, toleranceValue: e.target.value }))} placeholder="tolerance value" className="h-8 w-28 text-xs" />
              )}
            </div>
          </div>
        )}

        <Input value={form.message} onChange={(e) => setForm((f) => ({ ...f, message: e.target.value }))} placeholder="message (optional)" className="h-8 text-xs" />
        {error && <div className="text-xs text-red-600">{error}</div>}
        <Button type="button" size="sm" onClick={() => void handleCreate()} disabled={creating}>
          {creating ? 'Creating…' : 'Create rule'}
        </Button>
      </div>
    </div>
  );
}

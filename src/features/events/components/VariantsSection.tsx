/**
 * Variant list + create form for the event editor (D-03, T-1-05): the conditions editor only
 * offers properties linked to the event with role `discriminator` and their `allowed_values_json`
 * (D-16). Variants are their own entity (`/api/projects/:projectId/events/:id/variants`), saved
 * immediately on create/delete rather than batched with the rest of the event form.
 */
import React, { useCallback, useEffect, useState } from 'react';
import { Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { VARIANT_OPERATORS } from '@/src/domain/enums';

export interface DiscriminatorProperty {
  id: string;
  name: string;
  allowed_values_json: { value: string; label?: string | null }[];
}

interface VariantCondition {
  property_id: string;
  operator: string;
  values: string[];
}

interface VariantRow {
  id: string;
  name: string;
  description: string | null;
  conditions_json: VariantCondition[];
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function conditionsSummary(conditions: VariantCondition[], discriminators: DiscriminatorProperty[]): string {
  return conditions
    .map((c) => {
      const name = discriminators.find((d) => d.id === c.property_id)?.name ?? c.property_id;
      return c.operator === 'equals' ? `${name} = ${c.values[0] ?? ''}` : `${name} in (${c.values.join('|')})`;
    })
    .join(', ');
}

interface DraftCondition {
  property_id: string;
  operator: string;
  values: string[];
}

function emptyDraftCondition(): DraftCondition {
  return { property_id: '', operator: 'equals', values: [] };
}

export function VariantsSection({
  projectId,
  eventId,
  discriminators,
  standardEventByVariantId,
}: {
  projectId: string;
  eventId: string;
  discriminators: DiscriminatorProperty[];
  /** Standard event key mapped to each variant id, if any (for the "Standard event" column). */
  standardEventByVariantId?: Record<string, string>;
}) {
  const [variants, setVariants] = useState<VariantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [conditions, setConditions] = useState<DraftCondition[]>([emptyDraftCondition()]);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}/variants`);
    const data = await parseJson(res);
    if (res.ok) setVariants(Array.isArray(data) ? data : []);
    setLoading(false);
  }, [projectId, eventId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateCondition = (index: number, patch: Partial<DraftCondition>) =>
    setConditions((prev) => prev.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const addCondition = () => setConditions((prev) => (prev.length >= 2 ? prev : [...prev, emptyDraftCondition()]));
  const removeCondition = (index: number) => setConditions((prev) => prev.filter((_, i) => i !== index));

  const handleCreate = async () => {
    const cleaned = conditions
      .filter((c) => c.property_id && c.values.length > 0)
      .map((c) => ({ property_id: c.property_id, operator: c.operator, values: c.values }));
    if (cleaned.length === 0) {
      setError('At least one condition (property + value) is required.');
      return;
    }
    setCreating(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}/variants`, {
        method: 'POST',
        body: JSON.stringify({ conditions: cleaned, description: description.trim() || null }),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to create variant.');
        return;
      }
      setDescription('');
      setConditions([emptyDraftCondition()]);
      await load();
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (variantId: string) => {
    if (!window.confirm('Delete this variant?')) return;
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}/variants/${variantId}`, {
      method: 'DELETE',
    });
    if (res.ok || res.status === 204) await load();
  };

  if (discriminators.length === 0) {
    return (
      <div className="text-xs text-gray-500 border-t pt-4">
        Variants need at least one property linked with role "discriminator" (see Linked properties above).
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t pt-4">
      <h3 className="text-sm font-semibold text-gray-900">Variants</h3>
      {loading ? (
        <div className="text-sm text-gray-500">Loading…</div>
      ) : (
        <table className="w-full text-left text-xs border">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-3 py-2 font-medium text-gray-500">Name</th>
              <th className="px-3 py-2 font-medium text-gray-500">Conditions</th>
              <th className="px-3 py-2 font-medium text-gray-500">Standard event</th>
              <th className="px-3 py-2 font-medium text-gray-500 w-10" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {variants.map((v) => (
              <tr key={v.id}>
                <td className="px-3 py-2 font-medium text-gray-900 font-mono">{v.name}</td>
                <td className="px-3 py-2 text-gray-600">{conditionsSummary(v.conditions_json, discriminators)}</td>
                <td className="px-3 py-2 text-gray-600">{standardEventByVariantId?.[v.id] ?? '—'}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => void handleDelete(v.id)} className="text-red-500 hover:text-red-700">
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </tr>
            ))}
            {variants.length === 0 && (
              <tr><td colSpan={4} className="px-3 py-4 text-center text-gray-500">No variants yet.</td></tr>
            )}
          </tbody>
        </table>
      )}

      <div className="border rounded-md p-3 space-y-2 bg-gray-50">
        <div className="text-xs font-medium text-gray-700">Add variant</div>
        {conditions.map((condition, index) => {
          const property = discriminators.find((d) => d.id === condition.property_id);
          const allowedValues = property?.allowed_values_json ?? [];
          return (
            <div key={index} className="flex items-center gap-2">
              <select
                value={condition.property_id}
                onChange={(e) => updateCondition(index, { property_id: e.target.value, values: [] })}
                className="h-8 rounded border border-gray-300 px-2 text-xs"
              >
                <option value="">property…</option>
                {discriminators.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
              <select
                value={condition.operator}
                onChange={(e) => updateCondition(index, { operator: e.target.value })}
                className="h-8 rounded border border-gray-300 px-2 text-xs"
              >
                {VARIANT_OPERATORS.map((op) => <option key={op} value={op}>{op}</option>)}
              </select>
              {condition.operator === 'equals' ? (
                <select
                  value={condition.values[0] ?? ''}
                  onChange={(e) => updateCondition(index, { values: e.target.value ? [e.target.value] : [] })}
                  className="h-8 rounded border border-gray-300 px-2 text-xs"
                  disabled={!property}
                >
                  <option value="">value…</option>
                  {allowedValues.map((v) => <option key={v.value} value={v.value}>{v.label || v.value}</option>)}
                </select>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {allowedValues.map((v) => (
                    <label key={v.value} className="flex items-center gap-1 text-xs bg-white border rounded px-1.5 py-0.5">
                      <input
                        type="checkbox"
                        checked={condition.values.includes(v.value)}
                        disabled={!property}
                        onChange={(e) =>
                          updateCondition(index, {
                            values: e.target.checked
                              ? [...condition.values, v.value]
                              : condition.values.filter((val) => val !== v.value),
                          })
                        }
                      />
                      {v.label || v.value}
                    </label>
                  ))}
                </div>
              )}
              {conditions.length > 1 && (
                <button type="button" onClick={() => removeCondition(index)} className="text-red-500 hover:text-red-700">
                  <Trash2 className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        {conditions.length < 2 && (
          <Button type="button" variant="outline" size="sm" onClick={addCondition}>
            + condition (max 2 discriminators)
          </Button>
        )}
        <Input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          className="h-8 text-xs"
        />
        {error && <div className="text-xs text-red-600">{error}</div>}
        <Button type="button" size="sm" onClick={() => void handleCreate()} disabled={creating} className="gap-1">
          {creating ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Create variant
        </Button>
      </div>
    </div>
  );
}

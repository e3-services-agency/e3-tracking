/**
 * `EventProperty` link list editor (D-16, T-1-04, D-58 T-4-00): each row edits `required`, `role`,
 * `payload_key`, `source_id`, `priority`, `status`, and (when the property carries more than one
 * named definition) which definition this link uses. Discriminator and context rows are badged
 * and show their allowed values inline (the linked definition's own, falling back to the
 * property's) with the standard-event hint per value (D-03).
 */
import { effectivePayloadKey } from '@/src/domain/payloadKey';
import React, { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { RoleBadge } from '@/src/components/ui/badges';
import { Input } from '@/src/components/ui/Input';
import { EVENT_PROPERTY_ROLES, ENTITY_STATUSES, PRIORITIES, PROPERTY_DEFINITION_DEFAULT_NAME } from '@/src/domain/enums';

export interface LinkedPropertyRow {
  property_id: string;
  required: boolean;
  role: string;
  priority: string | null;
  status: string | null;
  source_id: string | null;
  payload_key: string | null;
  definition_id?: string | null;
  property: {
    id: string;
    name: string;
    scope: string;
    allowed_values_json?: { value: string; label?: string | null; standard_event?: string | null }[] | null;
  };
}

interface SourceRow {
  id: string;
  name: string;
}

export interface DefinitionOption {
  id: string;
  name: string;
  allowed_values_json?: { value: string; label?: string | null; standard_event?: string | null }[] | null;
  /** T-4-24: shown in the nested definition rows. */
  description?: string | null;
  formats_json?: string[] | null;
  example_values_json?: unknown;
}

function exampleText(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ');
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

const ROLE_BADGE_STYLE: Record<string, string> = {
  discriminator: 'bg-purple-50 text-purple-700 border-purple-200',
  context: 'bg-amber-50 text-amber-700 border-amber-200',
};

export function LinkedPropertiesEditor({
  links,
  onChange,
  sources,
  definitionsByPropertyId,
}: {
  links: LinkedPropertyRow[];
  onChange: (next: LinkedPropertyRow[]) => void;
  sources: SourceRow[];
  /** D-58: every definition of every linked property, keyed by property id. A property with one
   * definition (the common case) shows no picker at all -- there is only one meaning to pick. */
  definitionsByPropertyId?: Record<string, DefinitionOption[]>;
}) {
  // T-4-24: a property row expands to its definitions as nested rows, with the picker inline.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpanded = (propertyId: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(propertyId)) next.delete(propertyId);
      else next.add(propertyId);
      return next;
    });
  const removeLink = (propertyId: string) => onChange(links.filter((l) => l.property_id !== propertyId));
  const updateLink = (propertyId: string, patch: Partial<LinkedPropertyRow>) =>
    onChange(links.map((l) => (l.property_id === propertyId ? { ...l, ...patch } : l)));

  return (
    <div className="space-y-2">
      {links.map((link) => {
        const definitions = definitionsByPropertyId?.[link.property_id] ?? [];
        // Fix round INFO 2: a link with no `definition_id` yet (freshly added, or a link the
        // server resolved to the default without echoing an explicit id) uses the property's
        // `general` definition -- the picker must show that, not just whichever option the
        // browser happens to render first for an empty `value`.
        const effectiveDefinitionId =
          link.definition_id ??
          definitions.find((d) => d.name === PROPERTY_DEFINITION_DEFAULT_NAME)?.id ??
          definitions[0]?.id ??
          '';
        const selectedDefinition = definitions.find((d) => d.id === effectiveDefinitionId) ?? null;
        const allowedValues =
          (selectedDefinition && Array.isArray(selectedDefinition.allowed_values_json) ? selectedDefinition.allowed_values_json : null) ??
          (Array.isArray(link.property.allowed_values_json) ? link.property.allowed_values_json : []);
        const badgeStyle = ROLE_BADGE_STYLE[link.role];
        return (
          <div key={link.property_id} className="border rounded-md p-3 space-y-2 bg-gray-50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm text-gray-900 font-mono">{effectivePayloadKey(link.property.name, link.payload_key)}</span>
                {effectivePayloadKey(link.property.name, link.payload_key) !== link.property.name && (
                  <span className="text-xs text-gray-500">name: {link.property.name}</span>
                )}
                {definitions.length > 0 && (
                  <button
                    type="button"
                    aria-expanded={expanded.has(link.property_id)}
                    onClick={() => toggleExpanded(link.property_id)}
                    className="text-xs text-gray-500 hover:text-gray-900"
                    title="Show this property's definitions"
                  >
                    {expanded.has(link.property_id) ? '▾' : '▸'} Definitions ({definitions.length})
                  </button>
                )}
                {badgeStyle && <RoleBadge role={link.role} />}
              </div>
              <button type="button" onClick={() => removeLink(link.property_id)} className="text-red-500 hover:text-red-700">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 items-center text-xs">
              <label className="flex items-center gap-1">
                <input type="checkbox" checked={link.required} onChange={(e) => updateLink(link.property_id, { required: e.target.checked })} />
                Required
              </label>
              <select value={link.role} onChange={(e) => updateLink(link.property_id, { role: e.target.value })} className="h-8 rounded border border-gray-300 px-2">
                {EVENT_PROPERTY_ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <select value={link.priority ?? ''} onChange={(e) => updateLink(link.property_id, { priority: e.target.value || null })} className="h-8 rounded border border-gray-300 px-2">
                <option value="">priority —</option>
                {PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}
              </select>
              <select value={link.status ?? ''} onChange={(e) => updateLink(link.property_id, { status: e.target.value || null })} className="h-8 rounded border border-gray-300 px-2">
                <option value="">status —</option>
                {ENTITY_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              {sources.length > 0 && (
                <select value={link.source_id ?? ''} onChange={(e) => updateLink(link.property_id, { source_id: e.target.value || null })} className="h-8 rounded border border-gray-300 px-2">
                  <option value="">source —</option>
                  {sources.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              )}
              <Input
                value={link.payload_key ?? ''}
                onChange={(e) => updateLink(link.property_id, { payload_key: e.target.value || null })}
                placeholder="payload key override"
                className="h-8 w-40 text-xs"
              />
              {definitions.length > 1 && (
                <select
                  value={effectiveDefinitionId}
                  onChange={(e) => updateLink(link.property_id, { definition_id: e.target.value || null })}
                  className="h-8 rounded border border-gray-300 px-2"
                  title="Which of this property's named meanings this event uses (D-58)"
                >
                  {definitions.map((d) => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              )}
            </div>
            {expanded.has(link.property_id) && definitions.length > 0 && (
              <table className="w-full text-left text-xs bg-white border rounded" data-testid="nested-definitions">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="px-2 py-1 font-medium text-gray-500 w-10" title="The definition this event uses">Use</th>
                    <th className="px-2 py-1 font-medium text-gray-500">Name</th>
                    <th className="px-2 py-1 font-medium text-gray-500">Description</th>
                    <th className="px-2 py-1 font-medium text-gray-500">Allowed values</th>
                    <th className="px-2 py-1 font-medium text-gray-500">Formats</th>
                    <th className="px-2 py-1 font-medium text-gray-500">Example</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {definitions.map((d) => (
                    <tr key={d.id} className={d.id === effectiveDefinitionId ? 'bg-blue-50' : undefined}>
                      <td className="px-2 py-1">
                        <input
                          type="radio"
                          name={`definition-${link.property_id}`}
                          aria-label={`Use definition ${d.name}`}
                          checked={d.id === effectiveDefinitionId}
                          onChange={() => updateLink(link.property_id, { definition_id: d.id })}
                        />
                      </td>
                      <td className="px-2 py-1 font-medium text-gray-900">{d.name}</td>
                      <td className="px-2 py-1 text-gray-600">{d.description ?? '—'}</td>
                      <td className="px-2 py-1 text-gray-600">
                        {Array.isArray(d.allowed_values_json) && d.allowed_values_json.length > 0
                          ? d.allowed_values_json.map((v) => v.value).join(', ')
                          : '—'}
                      </td>
                      <td className="px-2 py-1 text-gray-600">{Array.isArray(d.formats_json) && d.formats_json.length > 0 ? d.formats_json.join(', ') : '—'}</td>
                      <td className="px-2 py-1 text-gray-600">{exampleText(d.example_values_json)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {(link.role === 'discriminator' || link.role === 'context') && (
              <div className="text-xs text-gray-600 space-y-1 pt-1 border-t">
                <div className="font-medium text-gray-500">Allowed values:</div>
                {allowedValues.length === 0 ? (
                  <div className="text-red-600">No allowed values on this property — {link.role} requires an enum.</div>
                ) : (
                  <ul className="space-y-0.5">
                    {allowedValues.map((v) => (
                      <li key={v.value} className="flex items-center gap-2">
                        <span className="font-mono bg-white border rounded px-1">{v.value}</span>
                        {v.label && <span className="text-gray-500">{v.label}</span>}
                        {v.standard_event && (
                          <span className="inline-flex items-center rounded-full bg-blue-50 text-blue-700 text-[10px] px-1.5 py-0.5 border border-blue-200">
                            → {v.standard_event}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

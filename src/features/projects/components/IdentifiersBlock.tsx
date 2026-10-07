/**
 * Identifiers block (D-69, T-4-35, Settings page): the project's fixed list of Bloomreach hard ids
 * and soft ids (the cookie is a soft id flagged as cookie), as two lists like the Bloomreach project
 * settings screen. Add inline, rename (cascades to identity rules and events), change type,
 * reorder, delete (blocked while a rule or event uses it). Each name links to its rules on the
 * Identity rules page. Simplified UI (D-07).
 */
import React, { useCallback, useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { IDENTITY_TYPES } from '@/src/domain/enums';
import { useStore } from '@/src/store';

export interface IdentifierItem {
  id: string;
  name: string;
  type: string;
  description: string | null;
  is_cookie: boolean;
  sort_order: number;
  rule_count: number;
  event_count: number;
}

const TYPE_TITLES: Record<string, string> = { hard: 'Hard IDs', soft: 'Soft IDs' };

export function IdentifiersBlock({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<IdentifierItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState<Record<string, string>>({});
  const setRequestedTab = useStore((s) => s.setRequestedTab);

  const base = `${API_BASE}/api/projects/${projectId}/identifiers`;

  const load = useCallback(async () => {
    if (!projectId) return;
    const res = await fetchWithAuth(base);
    const data = await res.json().catch(() => []);
    if (res.ok && Array.isArray(data)) setItems(data);
  }, [projectId, base]);

  useEffect(() => {
    void load();
  }, [load]);

  const send = async (url: string, method: string, body?: unknown): Promise<boolean> => {
    setError(null);
    const res = await fetchWithAuth(url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(typeof data?.error === 'string' ? data.error : 'Request failed.');
      return false;
    }
    await load();
    return true;
  };

  const add = async (type: string) => {
    const name = (newName[type] ?? '').trim();
    if (!name) return;
    if (await send(base, 'POST', { name, type })) setNewName((n) => ({ ...n, [type]: '' }));
  };

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const reordered = [...items];
    const [item] = reordered.splice(index, 1);
    reordered.splice(target, 0, item);
    setItems(reordered);
    await send(`${base}/order`, 'PUT', { ids: reordered.map((i) => i.id) });
  };

  const rename = async (item: IdentifierItem) => {
    const name = window.prompt('Rename identifier (rules and events that use it follow)', item.name);
    if (name && name.trim() && name.trim() !== item.name) await send(`${base}/${item.id}`, 'PATCH', { name: name.trim() });
  };

  return (
    <section className="bg-white rounded-lg border shadow-sm p-6 space-y-4" data-testid="identifiers-block">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Identifiers</h2>
        <p className="text-sm text-gray-500 mt-1">
          The project&apos;s hard and soft IDs, set once like in the Bloomreach project settings. Identity rules describe how each one is set.
        </p>
      </div>
      {error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{error}</div>}
      {IDENTITY_TYPES.map((type) => {
        const list = items.filter((i) => i.type === type);
        return (
          <div key={type} data-testid={`identifiers-${type}`}>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">{TYPE_TITLES[type] ?? type}</h3>
            <ul className="divide-y rounded-md border">
              {list.map((item) => {
                const index = items.indexOf(item);
                const inUse = item.rule_count > 0 || item.event_count > 0;
                return (
                  <li key={item.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <div className="flex gap-1">
                      <button type="button" aria-label={`Move ${item.name} up`} onClick={() => void move(index, -1)} disabled={index === 0} className="text-gray-400 hover:text-gray-900 disabled:opacity-30"><ArrowUp className="w-4 h-4" /></button>
                      <button type="button" aria-label={`Move ${item.name} down`} onClick={() => void move(index, 1)} disabled={index === items.length - 1} className="text-gray-400 hover:text-gray-900 disabled:opacity-30"><ArrowDown className="w-4 h-4" /></button>
                    </div>
                    <button type="button" className="font-medium text-gray-900 hover:underline" title="Open its identity rules" onClick={() => setRequestedTab('identityRules')}>
                      {item.name}
                    </button>
                    {item.is_cookie && <span className="rounded bg-gray-100 px-1.5 py-0.5 text-xs text-gray-600" data-testid="cookie-badge">cookie</span>}
                    <span className="text-xs text-gray-400" title={`${item.rule_count} identity rule(s), ${item.event_count} event list(s)`}>
                      {item.rule_count} rule{item.rule_count === 1 ? '' : 's'}, {item.event_count} event{item.event_count === 1 ? '' : 's'}
                    </span>
                    <Input
                      className="h-8 flex-1"
                      defaultValue={item.description ?? ''}
                      placeholder="Description"
                      aria-label={`Description of ${item.name}`}
                      onBlur={(e) => { if (e.target.value !== (item.description ?? '')) void send(`${base}/${item.id}`, 'PATCH', { description: e.target.value }); }}
                    />
                    <select
                      className="h-8 rounded-md border border-gray-300 px-2 text-sm"
                      aria-label={`Type of ${item.name}`}
                      value={item.type}
                      onChange={(e) => void send(`${base}/${item.id}`, 'PATCH', { type: e.target.value })}
                    >
                      {IDENTITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                    </select>
                    <span className="flex items-center gap-1 text-xs text-gray-500">
                      <input type="checkbox" aria-label={`${item.name} is the cookie`} checked={item.is_cookie} onChange={(e) => void send(`${base}/${item.id}`, 'PATCH', { is_cookie: e.target.checked })} />
                      cookie
                    </span>
                    <Button type="button" variant="outline" size="sm" onClick={() => void rename(item)}>Rename</Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      aria-label={`Delete ${item.name}`}
                      disabled={inUse}
                      title={inUse ? `In use by ${item.rule_count} identity rule(s) and ${item.event_count} event(s); remove those first.` : 'Delete identifier'}
                      onClick={() => void send(`${base}/${item.id}`, 'DELETE')}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </li>
                );
              })}
              {list.length === 0 && <li className="px-3 py-2 text-sm text-gray-400">None yet.</li>}
            </ul>
            <div className="mt-2 flex gap-2">
              <Input
                className="h-8 max-w-xs"
                value={newName[type] ?? ''}
                placeholder={type === 'hard' ? 'e.g. registered, email_id' : 'e.g. cookie, cart_id'}
                aria-label={`New ${type} identifier name`}
                onChange={(e) => setNewName((n) => ({ ...n, [type]: e.target.value }))}
                onKeyDown={(e) => { if (e.key === 'Enter') void add(type); }}
              />
              <Button type="button" size="sm" className="gap-1" onClick={() => void add(type)} disabled={!(newName[type] ?? '').trim()}>
                <Plus className="w-4 h-4" /> Add
              </Button>
            </div>
          </div>
        );
      })}
    </section>
  );
}

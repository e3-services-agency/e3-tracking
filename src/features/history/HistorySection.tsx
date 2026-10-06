/**
 * `HistorySection` (T-3-02, D-44 capability 12): a read-only "when, who, source, field, before,
 * after" table for one entity, mounted on the editors listed in the PLAN's UI surface table (event,
 * property, use case, identity rule, consent category, catalog). Fetches
 * `GET /history?entity_id=<id>&entity_type=<type>` and, when `parentEntityId` is given, also
 * `GET /history?parent_entity_id=<id>` (children rows -- event_property/variant under an event,
 * requirement under a use case, catalog_field under a catalog), merged and sorted newest-first so a
 * single section shows both the entity's own edits and its children's.
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

export interface HistoryDiffEntry {
  field: string;
  before: unknown;
  after: unknown;
}

export interface HistoryRow {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_label: string | null;
  parent_entity_id: string | null;
  action: string;
  actor: string;
  source: string;
  batch_id: string | null;
  changed_at: string;
  diff_json: HistoryDiffEntry[];
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

const VIEW_PREF_KEY = 'e3.history.view';
export type HistoryViewPref = 'panel' | 'modal';

/** T-4-24: the remembered choice between the inline side panel table and the full-page modal. */
export function readHistoryViewPref(): HistoryViewPref {
  try {
    return window.localStorage.getItem(VIEW_PREF_KEY) === 'modal' ? 'modal' : 'panel';
  } catch {
    return 'panel';
  }
}

export function writeHistoryViewPref(pref: HistoryViewPref): void {
  try {
    window.localStorage.setItem(VIEW_PREF_KEY, pref);
  } catch {
    // storage unavailable (private mode, blocked): the choice just is not remembered
  }
}

function HistoryTable({ rows, wrap }: { rows: HistoryRow[]; wrap: boolean }) {
  const cell = wrap ? 'break-words whitespace-pre-wrap align-top' : 'align-top';
  return (
    <div className={wrap ? '' : 'overflow-x-auto'}>
      <table className={`w-full text-left text-xs ${wrap ? 'table-fixed' : ''}`}>
        <thead className="text-gray-500">
          <tr>
            <th className="py-1 pr-3 font-medium">When</th>
            <th className="py-1 pr-3 font-medium">Who</th>
            <th className="py-1 pr-3 font-medium">Source</th>
            <th className="py-1 pr-3 font-medium">Action</th>
            <th className="py-1 pr-3 font-medium">What</th>
            <th className="py-1 pr-3 font-medium">Field</th>
            <th className="py-1 pr-3 font-medium">Before</th>
            <th className="py-1 pr-3 font-medium">After</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.flatMap((row) => {
            const diffs = row.diff_json.length > 0 ? row.diff_json : [{ field: '—', before: null, after: null }];
            return diffs.map((diff, i) => (
              <tr key={`${row.id}:${i}`}>
                {i === 0 && (
                  <>
                    <td className={`py-1 pr-3 text-gray-500 ${cell}`} rowSpan={diffs.length}>{new Date(row.changed_at).toLocaleString()}</td>
                    <td className={`py-1 pr-3 text-gray-700 ${cell}`} rowSpan={diffs.length}>{row.actor}</td>
                    <td className={`py-1 pr-3 text-gray-500 ${cell}`} rowSpan={diffs.length}>{row.source}</td>
                    <td className={`py-1 pr-3 text-gray-700 ${cell}`} rowSpan={diffs.length}>{row.action}</td>
                    <td className={`py-1 pr-3 text-gray-700 ${cell}`} rowSpan={diffs.length}>{row.entity_label ?? row.entity_type}</td>
                  </>
                )}
                <td className={`py-1 pr-3 font-mono text-gray-600 ${cell}`}>{diff.field}</td>
                <td className={`py-1 pr-3 text-gray-500 ${cell}`}>{formatValue(diff.before)}</td>
                <td className={`py-1 pr-3 text-gray-900 ${cell}`}>{formatValue(diff.after)}</td>
              </tr>
            ));
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Esc closes, focus moves into the dialog and is trapped, returns to the opener, body scroll locked. */
export function useModalA11y(ref: React.RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input, select, [href], [tabindex]:not([tabindex="-1"])') ?? []);
    (focusables()[0] ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        ref.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !ref.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [ref]);
}

function HistoryModal({ rows, title, onClose, alwaysModal, onAlwaysModal }: {
  rows: HistoryRow[];
  title: string;
  onClose: () => void;
  alwaysModal: boolean;
  onAlwaysModal: (value: boolean) => void;
}) {
  const [actionFilter, setActionFilter] = useState('');
  const [text, setText] = useState('');
  const actions = useMemo(() => [...new Set(rows.map((r) => r.action))].sort(), [rows]);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  useModalA11y(dialogRef, onClose);
  const filtered = useMemo(() => {
    const q = text.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (!actionFilter || r.action === actionFilter) &&
        (!q ||
          [r.actor, r.source, r.entity_label ?? '', r.entity_type, ...r.diff_json.map((d) => `${d.field} ${formatValue(d.before)} ${formatValue(d.after)}`)]
            .join(' ')
            .toLowerCase()
            .includes(q))
    );
  }, [rows, actionFilter, text]);
  return (
    <div ref={dialogRef} tabIndex={-1} className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bg-white rounded-lg shadow-xl w-full h-full max-w-6xl flex flex-col">
        <div className="flex items-center justify-between p-4 border-b gap-4">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <div className="flex items-center gap-3 text-sm">
            <select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)} aria-label="Filter by action" className="h-9 rounded-md border border-gray-300 bg-white px-2 text-sm">
              <option value="">All actions</option>
              {actions.map((a) => <option key={a} value={a}>{a}</option>)}
            </select>
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Filter text" aria-label="Filter history text" className="h-9 w-56 rounded-md border border-gray-300 px-2 text-sm" />
            <label className="flex items-center gap-1 text-gray-700">
              <input type="checkbox" checked={alwaysModal} onChange={(e) => onAlwaysModal(e.target.checked)} /> Always open in full view
            </label>
            <button type="button" onClick={onClose} aria-label="Close history" className="p-2 hover:bg-gray-100 rounded-full">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {filtered.length === 0 ? <p className="text-sm text-gray-500">No changes match.</p> : <HistoryTable rows={filtered} wrap />}
        </div>
      </div>
    </div>
  );
}

export function HistorySection({
  projectId,
  entityType,
  entityId,
  parentEntityId,
  title = 'History',
}: {
  projectId: string;
  entityType: string;
  entityId: string;
  /** When given, children rows parented under this entity (e.g. event_property/variant under an
   * event) are merged into the same table (D-44's "children grouped under their parent panel"). */
  parentEntityId?: string;
  title?: string;
}) {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pref, setPref] = useState<HistoryViewPref>(() => readHistoryViewPref());
  // M1: the remembered "always full view" preference opens the modal on mount.
  const [modalOpen, setModalOpen] = useState(() => readHistoryViewPref() === 'modal');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const ownUrl = `${API_BASE}/api/projects/${projectId}/history?entity_type=${encodeURIComponent(entityType)}&entity_id=${encodeURIComponent(entityId)}&limit=200`;
      const [ownRes] = await Promise.all([fetchWithAuth(ownUrl)]);
      const ownData = await parseJson(ownRes);
      let merged: HistoryRow[] = ownRes.ok && Array.isArray(ownData.items) ? ownData.items : [];

      if (parentEntityId) {
        const childUrl = `${API_BASE}/api/projects/${projectId}/history?parent_entity_id=${encodeURIComponent(parentEntityId)}&limit=200`;
        const childRes = await fetchWithAuth(childUrl);
        const childData = await parseJson(childRes);
        if (childRes.ok && Array.isArray(childData.items)) {
          const seen = new Set(merged.map((r) => r.id));
          for (const row of childData.items as HistoryRow[]) {
            if (!seen.has(row.id)) merged.push(row);
          }
        }
      }

      merged.sort((a, b) => (a.changed_at < b.changed_at ? 1 : a.changed_at > b.changed_at ? -1 : 0));
      if (!cancelled) {
        setRows(merged);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, entityType, entityId, parentEntityId]);

  if (loading) return null;

  const setAlwaysModal = (value: boolean) => {
    const next: HistoryViewPref = value ? 'modal' : 'panel';
    setPref(next);
    writeHistoryViewPref(next);
    if (!value) setModalOpen(false);
  };

  return (
    <div className="space-y-2 border-t pt-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">{title}{rows.length > 0 ? ` (${rows.length})` : ''}</h3>
        {rows.length > 0 && (
          <button type="button" onClick={() => setModalOpen(true)} className="text-xs text-[var(--brand-primary)] hover:underline">
            Open full view
          </button>
        )}
      </div>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No changes recorded yet.</p>
      ) : pref === 'modal' ? (
        <p className="text-xs text-gray-500">
          Shown in the full view.{' '}
          <button type="button" className="underline" onClick={() => setAlwaysModal(false)}>Show here instead</button>
        </p>
      ) : (
        <HistoryTable rows={rows} wrap={false} />
      )}
      {modalOpen && rows.length > 0 && (
        <HistoryModal
          rows={rows}
          title={title}
          onClose={() => setModalOpen(false)}
          alwaysModal={pref === 'modal'}
          onAlwaysModal={setAlwaysModal}
        />
      )}
    </div>
  );
}

/**
 * `HistorySection` (T-3-02, D-44 capability 12): a read-only "when, who, source, field, before,
 * after" table for one entity, mounted on the editors listed in the PLAN's UI surface table (event,
 * property, use case, identity rule, consent category, catalog). Fetches
 * `GET /history?entity_id=<id>&entity_type=<type>` and, when `parentEntityId` is given, also
 * `GET /history?parent_entity_id=<id>` (children rows -- event_property/variant under an event,
 * requirement under a use case, catalog_field under a catalog), merged and sorted newest-first so a
 * single section shows both the entity's own edits and its children's.
 */
import React, { useEffect, useState } from 'react';
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

  return (
    <div className="space-y-2 border-t pt-4">
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-gray-500">No changes recorded yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
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
                        <td className="py-1 pr-3 text-gray-500" rowSpan={diffs.length}>
                          {new Date(row.changed_at).toLocaleString()}
                        </td>
                        <td className="py-1 pr-3 text-gray-700" rowSpan={diffs.length}>
                          {row.actor}
                        </td>
                        <td className="py-1 pr-3 text-gray-500" rowSpan={diffs.length}>
                          {row.source}
                        </td>
                        <td className="py-1 pr-3 text-gray-700" rowSpan={diffs.length}>
                          {row.action}
                        </td>
                        <td className="py-1 pr-3 text-gray-700" rowSpan={diffs.length}>
                          {row.entity_label ?? row.entity_type}
                        </td>
                      </>
                    )}
                    <td className="py-1 pr-3 font-mono text-gray-600">{diff.field}</td>
                    <td className="py-1 pr-3 text-gray-500">{formatValue(diff.before)}</td>
                    <td className="py-1 pr-3 text-gray-900">{formatValue(diff.after)}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

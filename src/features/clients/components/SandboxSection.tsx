/**
 * D-60 sandbox UI: a "Create a sandbox" button (`POST /api/projects/sandbox`) plus a separate list
 * of every sandbox project with bulk delete. Lives on the Clients page.
 */
import React, { useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { useStore } from '@/src/store';
import type { ProjectItem } from '@/src/features/projects/hooks/useProjects';

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function SandboxSection({
  projects,
  activeProjectId,
  onChanged,
}: {
  projects: ProjectItem[];
  /** So a bulk-delete that removes the currently active project can move the shell somewhere valid
   * instead of leaving every later call 404ing (E1 fix round). */
  activeProjectId: string;
  onChanged: () => void;
}) {
  const setActiveProject = useStore((s) => s.setActiveProject);
  const clearActiveProject = useStore((s) => s.clearActiveProject);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);

  const sandboxes = projects.filter((p) => p.is_sandbox);

  const createSandbox = async () => {
    setCreating(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/sandbox`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to create the sandbox.');
        return;
      }
      onChanged();
    } finally {
      setCreating(false);
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} sandbox project(s)? This cannot be undone.`)) return;
    setDeleting(true);
    setError(null);
    try {
      const ids = Array.from(selected);
      // I2 fix round: check `res.ok` per request instead of assuming every delete succeeded --
      // a 404/409 on one project must not be reported as a clean bulk delete.
      const results = await Promise.all(
        ids.map(async (id) => {
          try {
            const res = await fetchWithAuth(`${API_BASE}/api/projects/${id}`, { method: 'DELETE' });
            return { id, ok: res.ok, status: res.status };
          } catch {
            return { id, ok: false, status: 0 };
          }
        })
      );
      const failed = results.filter((r) => !r.ok);
      const deletedIds = new Set(results.filter((r) => r.ok).map((r) => r.id));

      // E1 fix round: if the active project was just deleted, move the shell to another surviving
      // project (any one) or, when none remain, clear it so the shell shows the "select/create a
      // project" gate instead of every subsequent call 404ing against a dead id.
      if (deletedIds.has(activeProjectId)) {
        const survivor = projects.find((p) => p.id !== activeProjectId && !deletedIds.has(p.id));
        if (survivor) {
          setActiveProject({ id: survivor.id, key: survivor.key ?? null });
        } else {
          clearActiveProject();
        }
      }

      setSelected(new Set(failed.map((f) => f.id)));
      if (failed.length > 0) {
        setError(
          `Failed to delete ${failed.length} of ${ids.length} sandbox project(s) (status ${failed
            .map((f) => f.status)
            .join(', ')}).`
        );
      }
      onChanged();
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border shadow-sm p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Sandboxes</h2>
          <p className="text-sm text-gray-500 mt-1">
            A sandbox is a project restored from bundled sample data, useful to explore the tool without a real client.
          </p>
        </div>
        <Button onClick={() => void createSandbox()} disabled={creating}>
          {creating ? 'Creating…' : 'Create a sandbox'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {sandboxes.length === 0 ? (
        <p className="text-sm text-gray-500">No sandboxes yet.</p>
      ) : (
        <div className="space-y-2">
          <table className="w-full text-left text-sm">
            <thead className="border-b">
              <tr>
                <th className="py-2 pr-2 w-6" />
                <th className="py-2 pr-2 font-medium text-gray-500">Name</th>
                <th className="py-2 pr-2 font-medium text-gray-500">Key</th>
                <th className="py-2 pr-2 font-medium text-gray-500">Client</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sandboxes.map((p) => (
                <tr key={p.id}>
                  <td className="py-2 pr-2">
                    <input type="checkbox" checked={selected.has(p.id)} onChange={() => toggle(p.id)} />
                  </td>
                  <td className="py-2 pr-2 text-gray-900">
                    {p.name}{' '}
                    <span className="text-[10px] uppercase tracking-wide text-amber-700 bg-amber-100 rounded px-1 py-0.5">
                      Sandbox
                    </span>
                  </td>
                  <td className="py-2 pr-2 font-mono text-gray-500">{p.key}</td>
                  <td className="py-2 pr-2 text-gray-500">{p.client?.name ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Button variant="destructive" size="sm" disabled={selected.size === 0 || deleting} onClick={() => void deleteSelected()} className="gap-2">
            <Trash2 className="w-4 h-4" /> {deleting ? 'Deleting…' : `Delete ${selected.size || ''} selected`}
          </Button>
        </div>
      )}
      {creating && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
    </div>
  );
}

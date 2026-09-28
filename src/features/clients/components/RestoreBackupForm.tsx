/**
 * "Restore backup" form (T-3-05, D-45), Clients page. Paste the backup JSON or pick a file,
 * preview (counts + warnings), pick the target client, name and key, then apply and switch the
 * app into the newly created project. Simplified UI (D-07): no design work, one flat form.
 */
import React, { useState } from 'react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { useStore } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import type { ClientRow } from '@/src/features/clients/hooks/useClients';

interface PreviewResult {
  counts: Record<string, number>;
  project: { name: string; key: string };
  warnings: string[];
  payload_hash: string;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function RestoreBackupForm({ clients }: { clients: ClientRow[] }) {
  const setActiveProject = useStore((s) => s.setActiveProject);
  const [raw, setRaw] = useState('');
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [clientId, setClientId] = useState('');
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') setRaw(reader.result);
    };
    reader.readAsText(file);
  };

  const handlePreview = async () => {
    setError(null);
    setPreview(null);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      setError('Not valid JSON.');
      return;
    }
    setIsPreviewing(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/restore-backup/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to preview backup');
        return;
      }
      const result = data as PreviewResult;
      setPreview(result);
      setName((prev) => prev || `${result.project.name} (restored)`);
      setKey((prev) => prev || `${result.project.key}-restored`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setIsPreviewing(false);
    }
  };

  const handleApply = async () => {
    if (!preview) return;
    setError(null);
    setIsApplying(true);
    try {
      const backup = JSON.parse(raw);
      const res = await fetchWithAuth(`${API_BASE}/api/projects/restore-backup/apply`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          backup,
          payload_hash: preview.payload_hash,
          project: { name: name.trim(), key: key.trim(), client_id: clientId },
        }),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to restore backup');
        return;
      }
      const restoredProject = data.project as { id: string; key: string };
      setActiveProject({ id: restoredProject.id, key: restoredProject.key });
      // Simplest reliable refresh for every other component that already cached the project list
      // (project switcher, sidebar) -- a full reload lands on the newly active project (D-07).
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4 max-w-2xl">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Restore backup</h2>
        <p className="text-sm text-gray-500">
          Paste a full JSON backup (or choose the file) to restore it as a brand-new project. Never merges into an existing project.
        </p>
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Backup file</label>
        <input
          type="file"
          accept="application/json"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleFile(file);
          }}
        />
      </div>

      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">or paste backup JSON</label>
        <textarea
          className="w-full h-32 border rounded p-2 font-mono text-xs"
          value={raw}
          onChange={(e) => {
            setRaw(e.target.value);
            setPreview(null);
          }}
          placeholder='{"format": "e3-tracking-backup", "version": 1, ...}'
        />
      </div>

      {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</p>}

      <Button type="button" variant="outline" onClick={handlePreview} disabled={!raw.trim() || isPreviewing}>
        {isPreviewing ? 'Previewing…' : 'Preview'}
      </Button>

      {preview && (
        <div className="space-y-4 border-t pt-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700">Source project</h3>
            <p className="text-sm text-gray-500">
              {preview.project.name} ({preview.project.key})
            </p>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700">Counts</h3>
            <ul className="text-sm text-gray-600 grid grid-cols-3 gap-x-4">
              {Object.entries(preview.counts).map(([table, count]) => (
                <li key={table}>
                  {table}: {count}
                </li>
              ))}
            </ul>
          </div>

          {preview.warnings.length > 0 && (
            <div>
              <h3 className="text-sm font-medium text-gray-700">Warnings</h3>
              <ul className="text-sm text-amber-700 list-disc pl-5">
                {preview.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">Client</label>
            <select
              className="w-full border rounded h-10 px-3 text-sm"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">New project name</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">New project key (URL-safe)</label>
            <Input value={key} onChange={(e) => setKey(e.target.value)} className="font-mono" />
          </div>

          <Button
            type="button"
            onClick={handleApply}
            disabled={isApplying || !clientId || !name.trim() || !key.trim()}
          >
            {isApplying ? 'Restoring…' : 'Apply'}
          </Button>
        </div>
      )}
    </div>
  );
}

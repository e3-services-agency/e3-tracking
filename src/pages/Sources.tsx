/**
 * Sources: plain table + create/edit form against `/api/projects/:projectId/sources` (D-15).
 * Simplified UI (D-07).
 */
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
import { FieldLabel, HintTh } from '@/src/components/ui/FieldHint';
import React, { useCallback, useEffect, useState } from 'react';
import { Search, Plus, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { Sheet } from '@/src/components/ui/Sheet';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { SOURCE_COLORS, SOURCE_METHODS, SOURCE_SYSTEMS } from '@/src/domain/enums';
import { SOURCE_COLOR_LABELS, SOURCE_METHOD_LABELS, SOURCE_SYSTEM_LABELS, isSourceColor } from '@/src/domain/sources';
import { SourceBadge } from '@/src/components/ui/badges';

interface SourceRow {
  id: string;
  project_id: string;
  name: string;
  color: string | null;
  /** D-62 (T-4-11B). */
  system: string;
  method: string | null;
  created_at: string;
  updated_at: string;
}

interface SourceUsage {
  source_id: string;
  property_count: number;
  event_count: number;
  identity_rule_count: number;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function Sources() {
  const { activeProjectId, hasValidProjectContext } = useProjectShell();
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [usageBySourceId, setUsageBySourceId] = useState<Record<string, SourceUsage>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const load = useCallback(async () => {
    if (!hasValidProjectContext || !activeProjectId) return;
    const res = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/sources`);
    const data = await parseJson(res);
    if (res.ok) setSources(Array.isArray(data) ? data : []);

    const usageRes = await fetchWithAuth(`${API_BASE}/api/projects/${activeProjectId}/sources/usage`);
    const usageData = await parseJson(usageRes);
    if (usageRes.ok && Array.isArray(usageData)) {
      const next: Record<string, SourceUsage> = {};
      for (const row of usageData as SourceUsage[]) next[row.source_id] = row;
      setUsageBySourceId(next);
    }
  }, [hasValidProjectContext, activeProjectId]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredSources = sources.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase()));

  const handleOpenSource = (id: string) => {
    setSelectedSourceId(id);
    setIsCreating(false);
    setIsSheetOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedSourceId(null);
    setIsCreating(true);
    setIsSheetOpen(true);
  };

  const selectedSource = selectedSourceId ? sources.find((s) => s.id === selectedSourceId) : null;

  return (
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Sources</h1>
          <p className="text-sm text-gray-500 mt-1">Platforms where events are tracked.</p>
        </div>
        <Button onClick={handleCreateNew} className="gap-2">
          <Plus className="w-4 h-4" /> Add Source
        </Button>
      </PageHeader>

      <PageBody>
        <div className="mb-6 relative">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <Input
            placeholder="Search sources..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10 max-w-md bg-white"
          />
        </div>

        <div className="bg-white rounded-lg border shadow-sm overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Name" hintScope="Sources">Name</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="System via method" hintScope="Sources">System via method</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Color" hintScope="Sources">Color</HintTh>
                <HintTh className="px-6 py-3 font-medium text-gray-500" hint="Used In" hintScope="Sources">Used In</HintTh>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredSources.map((source) => {
                const usage = usageBySourceId[source.id];
                return (
                  <tr key={source.id} onClick={() => handleOpenSource(source.id)} className="hover:bg-gray-50 cursor-pointer transition-colors">
                    <td className="px-6 py-4 font-medium text-gray-900">{source.name}</td>
                    <td className="px-6 py-4 text-gray-700"><SourceBadge system={source.system} method={source.method} color={source.color} /></td>
                    <td className="px-6 py-4 text-gray-500">{isSourceColor(source.color) ? SOURCE_COLOR_LABELS[source.color] : '—'}</td>
                    <td className="px-6 py-4 text-gray-500">
                      Properties: {usage?.property_count ?? 0} · Events: {usage?.event_count ?? 0} · Identity rules:{' '}
                      {usage?.identity_rule_count ?? 0}
                    </td>
                  </tr>
                );
              })}
              {filteredSources.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No sources found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PageBody>

      <Sheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} title={isCreating ? 'Create Source' : 'Edit Source'}>
        <SourceEditor
          key={isCreating ? 'create' : selectedSourceId ?? 'none'}
          source={selectedSource}
          isCreating={isCreating}
          usage={selectedSourceId ? usageBySourceId[selectedSourceId] : undefined}
          projectId={activeProjectId}
          onSaved={async () => {
            await load();
            setIsSheetOpen(false);
          }}
          onClose={() => setIsSheetOpen(false)}
        />
      </Sheet>
    </div>
  );
}

function SourceEditor({
  source,
  isCreating,
  usage,
  projectId,
  onSaved,
  onClose,
}: {
  source: SourceRow | null | undefined;
  isCreating: boolean;
  usage?: SourceUsage;
  projectId: string;
  onSaved: () => Promise<void>;
  onClose: () => void;
}) {
  const [name, setName] = useState(source?.name || '');
  const [color, setColor] = useState(source?.color || '');
  const [system, setSystem] = useState(source?.system || 'other');
  const [method, setMethod] = useState(source?.method || '');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    setName(source?.name || '');
    setColor(source?.color || '');
    setSystem(source?.system || 'other');
    setMethod(source?.method || '');
    setSaveError(null);
  }, [source?.id, isCreating]);

  const handleSave = async () => {
    if (!name.trim() || !projectId) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const url = isCreating
        ? `${API_BASE}/api/projects/${projectId}/sources`
        : `${API_BASE}/api/projects/${projectId}/sources/${source?.id}`;
      const res = await fetchWithAuth(url, {
        method: isCreating ? 'POST' : 'PATCH',
        body: JSON.stringify({ name: name.trim(), color: color.trim() || null, system, method: method || null }),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to save.');
        return;
      }
      await onSaved();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!source || !projectId) return;
    const propertyCount = usage?.property_count ?? 0;
    const eventCount = usage?.event_count ?? 0;
    const identityRuleCount = usage?.identity_rule_count ?? 0;
    const usageNote =
      propertyCount > 0 || eventCount > 0 || identityRuleCount > 0
        ? `\n\nThis source is referenced by ${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'}, ${eventCount} event${eventCount === 1 ? '' : 's'} and ${identityRuleCount} identity rule${identityRuleCount === 1 ? '' : 's'}.`
        : '';
    if (!window.confirm(`Delete source "${source.name}"?${usageNote}`)) return;
    setIsDeleting(true);
    setSaveError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/sources/${source.id}`, { method: 'DELETE' });
      if (!res.ok && res.status !== 204) {
        const data = await parseJson(res);
        setSaveError(typeof data?.error === 'string' ? data.error : 'Failed to delete.');
        return;
      }
      await onSaved();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" hint="Source Name" hintScope="Sources">Source Name</FieldLabel>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. iOS App" disabled={isSaving} />
      </div>
      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" htmlFor="source-system" hint="System" hintScope="Sources">System</FieldLabel>
        <select id="source-system" value={system} onChange={(e) => setSystem(e.target.value)} disabled={isSaving} className="block h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm">
          {SOURCE_SYSTEMS.map((s) => <option key={s} value={s}>{SOURCE_SYSTEM_LABELS[s]}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" htmlFor="source-method" hint="Collection method" hintScope="Sources">Collection method</FieldLabel>
        <select id="source-method" value={method} onChange={(e) => setMethod(e.target.value)} disabled={isSaving} className="block h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm">
          <option value="">Not recorded</option>
          {SOURCE_METHODS.map((m) => <option key={m} value={m}>{SOURCE_METHOD_LABELS[m]}</option>)}
        </select>
        <p className="text-xs text-gray-500">A Tracking API source makes a linked event server-side by default; a web source keeps it client-side. An event's own choice is never overridden.</p>
      </div>
      <div className="space-y-2">
        <FieldLabel className="text-sm font-medium text-gray-700" htmlFor="source-color" hint="Color (optional)" hintScope="Sources">Color</FieldLabel>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            data-testid="source-color-swatch"
            className="inline-block h-5 w-5 shrink-0 rounded-full border border-gray-200"
            style={{ backgroundColor: `var(--${isSourceColor(color) ? color : 'source-8'})` }}
          />
          <select id="source-color" value={color} onChange={(e) => setColor(e.target.value)} disabled={isSaving} className="block h-9 w-full rounded-md border border-gray-300 bg-white px-2 text-sm">
            <option value="">{isCreating ? 'Automatic (by system)' : 'Automatic'}</option>
            {SOURCE_COLORS.map((c) => <option key={c} value={c}>{SOURCE_COLOR_LABELS[c]}</option>)}
          </select>
        </div>
        <ul className="flex flex-wrap gap-2" aria-label="Palette">
          {SOURCE_COLORS.map((c) => (
            <li key={c}>
              <button type="button" onClick={() => setColor(c)} disabled={isSaving} title={SOURCE_COLOR_LABELS[c]} aria-label={SOURCE_COLOR_LABELS[c]} className={`h-5 w-5 rounded-full border ${color === c ? 'ring-2 ring-offset-1 ring-gray-500' : 'border-gray-200'}`} style={{ backgroundColor: `var(--${c})` }} />
            </li>
          ))}
        </ul>
      </div>
      {saveError && (
        <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">{saveError}</div>
      )}
      <div className="pt-6 border-t flex justify-between">
        {!isCreating && source ? (
          <Button variant="destructive" onClick={() => void handleDelete()} disabled={isSaving || isDeleting} className="gap-2">
            {isDeleting ? (<><Loader2 className="w-4 h-4 animate-spin" /> Deleting…</>) : (<><Trash2 className="w-4 h-4" /> Delete</>)}
          </Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onClose} disabled={isSaving || isDeleting}>Cancel</Button>
          <Button onClick={() => void handleSave()} disabled={isSaving || isDeleting} className="gap-2">
            {isSaving ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving…</>) : 'Save Source'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/**
 * Clients section (D-27): plain table plus create/edit form. Reachable from the project
 * switcher and from Settings. Simplified UI (D-07): no design work.
 */
import React, { useState } from 'react';
import { useClients, type ClientRow } from '@/src/features/clients/hooks/useClients';
import { useProjectShell } from '@/src/features/projects/context/ProjectShellContext';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { RestoreBackupForm } from '@/src/features/clients/components/RestoreBackupForm';
import { SandboxSection } from '@/src/features/clients/components/SandboxSection';
import { NewProjectModal } from '@/src/features/projects/components/NewProjectModal';

export function Clients() {
  const { clients, isLoading, error, createClient, updateClient, deleteClient } = useClients();
  // E1 fix round (reviewer FAIL): Clients.tsx used to hold its own `useProjects()` instance, so a
  // sandbox created (or deleted) here never reached `ProjectSwitcher`/`Layout` (each reads the one
  // `ProjectShellProvider` instance) until a full reload. Reading the shell's own `projects`/
  // `fetchProjects` keeps every consumer of the project list in sync from one fetch.
  const { projects, fetchProjects, activeProjectId } = useProjectShell();
  const [editing, setEditing] = useState<ClientRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [newProjectModalOpen, setNewProjectModalOpen] = useState(false);

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      <div className="p-8 border-b bg-white flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-500 mt-1">Bloomreach accounts. Each owns one or more projects.</p>
        </div>
        <Button onClick={() => { setCreating(true); setEditing(null); }}>Add client</Button>
      </div>

      <div className="p-8 flex-1 overflow-y-auto space-y-6">
        {error && <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{error}</div>}

        {!isLoading && projects.length === 0 && (
          <div className="rounded-md border border-blue-200 bg-blue-50 px-4 py-3 flex items-center justify-between gap-4">
            <p className="text-sm text-blue-900">
              No projects yet. Create your first project, or start from a populated sandbox.
            </p>
            <div className="flex gap-2 flex-shrink-0">
              <Button onClick={() => setNewProjectModalOpen(true)}>Create your first project</Button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-lg border shadow-sm">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 font-medium text-gray-500">Name</th>
                <th className="px-6 py-3 font-medium text-gray-500">Key</th>
                <th className="px-6 py-3 font-medium text-gray-500">Bloomreach account id</th>
                <th className="px-6 py-3 font-medium text-gray-500" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {clients.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-3 font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-3 text-gray-500 font-mono">{c.key}</td>
                  <td className="px-6 py-3 text-gray-500">{c.bloomreach_account_id || '—'}</td>
                  <td className="px-6 py-3 text-right">
                    <button
                      type="button"
                      className="text-sm text-[var(--brand-primary)] hover:underline"
                      onClick={() => { setEditing(c); setCreating(false); }}
                    >
                      Edit
                    </button>
                  </td>
                </tr>
              ))}
              {!isLoading && clients.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-gray-500">No clients yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {(creating || editing) && (
          <ClientForm
            client={editing}
            onCancel={() => { setCreating(false); setEditing(null); }}
            onSave={async (input) => {
              const result = editing ? await updateClient(editing.id, input) : await createClient(input as any);
              if (result.success) {
                setCreating(false);
                setEditing(null);
              }
              return result;
            }}
            onDelete={
              editing
                ? async () => {
                    const result = await deleteClient(editing.id);
                    if (result.success) setEditing(null);
                    return result;
                  }
                : undefined
            }
          />
        )}

        <SandboxSection projects={projects} activeProjectId={activeProjectId} onChanged={fetchProjects} />

        <RestoreBackupForm clients={clients} />
      </div>

      <NewProjectModal
        isOpen={newProjectModalOpen}
        onClose={() => setNewProjectModalOpen(false)}
        onSuccess={() => { setNewProjectModalOpen(false); fetchProjects(); }}
      />
    </div>
  );
}

function ClientForm({
  client,
  onCancel,
  onSave,
  onDelete,
}: {
  client: ClientRow | null;
  onCancel: () => void;
  onSave: (input: { key: string; name: string; bloomreach_account_id?: string; notes?: string }) => Promise<{ success: boolean; error?: string }>;
  onDelete?: () => Promise<{ success: boolean; error?: string }>;
}) {
  const [key, setKey] = useState(client?.key ?? '');
  const [name, setName] = useState(client?.name ?? '');
  const [bloomreachAccountId, setBloomreachAccountId] = useState(client?.bloomreach_account_id ?? '');
  const [notes, setNotes] = useState(client?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setFormError(null);
    const result = await onSave({ key: key.trim(), name: name.trim(), bloomreach_account_id: bloomreachAccountId.trim(), notes: notes.trim() });
    setSaving(false);
    if (!result.success) setFormError(result.error ?? 'Failed to save');
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    if (!window.confirm(`Delete client "${client?.name}"?`)) return;
    setSaving(true);
    setFormError(null);
    const result = await onDelete();
    setSaving(false);
    if (!result.success) setFormError(result.error ?? 'Failed to delete');
  };

  return (
    <div className="bg-white p-6 rounded-lg border shadow-sm space-y-4 max-w-lg">
      <h2 className="text-lg font-semibold text-gray-900">{client ? 'Edit client' : 'New client'}</h2>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Name</label>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Key (URL-safe)</label>
        <Input value={key} onChange={(e) => setKey(e.target.value)} placeholder="acme" className="font-mono" />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Bloomreach account id (optional)</label>
        <Input value={bloomreachAccountId} onChange={(e) => setBloomreachAccountId(e.target.value)} />
      </div>
      <div className="space-y-2">
        <label className="block text-sm font-medium text-gray-700">Notes (optional)</label>
        <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
      {formError && <p className="text-sm text-red-600">{formError}</p>}
      <div className="flex justify-between pt-2">
        {onDelete ? (
          <Button variant="destructive" onClick={handleDelete} disabled={saving}>Delete</Button>
        ) : <div />}
        <div className="flex gap-2">
          <Button variant="outline" onClick={onCancel} disabled={saving}>Cancel</Button>
          <Button onClick={handleSave} disabled={saving || !name.trim() || !key.trim()}>
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </div>
      </div>
    </div>
  );
}

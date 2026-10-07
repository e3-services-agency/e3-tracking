import React, { useState, useEffect } from 'react';
import { FieldLabel } from '@/src/components/ui/FieldHint';
import { X } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { useProjectShell } from '../context/ProjectShellContext';
import { slugify } from '@/src/domain/slug';
import { useClients } from '@/src/features/clients/hooks/useClients';

const SPACE_BLUE = 'var(--e3-space-blue)';
const E3_WHITE = 'var(--e3-white)';

export interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (projectId: string, projectName: string, projectKey: string) => void;
}

export function NewProjectModal({ isOpen, onClose, onSuccess }: NewProjectModalProps) {
  const [clientId, setClientId] = useState('');
  const [name, setName] = useState('');
  const [key, setKey] = useState('');
  const [keyTouched, setKeyTouched] = useState(false);
  const [errors, setErrors] = useState<{ client?: string; name?: string; key?: string }>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [creatingClient, setCreatingClient] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientKey, setNewClientKey] = useState('');
  const [clientSubmitting, setClientSubmitting] = useState(false);
  const [clientSubmitError, setClientSubmitError] = useState<string | null>(null);

  const { fetchProjects, createProject } = useProjectShell();
  const { clients, fetchClients, createClient } = useClients();

  useEffect(() => {
    if (isOpen) {
      fetchClients();
      setName('');
      setKey('');
      setKeyTouched(false);
      setErrors({});
      setClientId('');
      setSubmitError(null);
      setCreatingClient(false);
      setNewClientName('');
      setNewClientKey('');
      setClientSubmitError(null);
    }
  }, [isOpen, fetchClients]);

  // Fresh installs have zero clients and zero projects; Clients used to be reachable only from
  // inside a project's shell, deadlocking onboarding (fix round finding #1). Creating a client
  // inline here, instead of only linking to the Clients page, keeps project creation a single flow.
  const handleCreateClient = async (e: React.SyntheticEvent) => {
    e.preventDefault();
    const trimmedName = newClientName.trim();
    const trimmedKey = newClientKey.trim();
    if (!trimmedName || !trimmedKey) return;
    setClientSubmitting(true);
    setClientSubmitError(null);
    const result = await createClient({ key: trimmedKey, name: trimmedName });
    setClientSubmitting(false);
    if (result.success) {
      setClientId(result.client.id);
      setErrors((prev) => ({ ...prev, client: undefined }));
      setCreatingClient(false);
      setNewClientName('');
      setNewClientKey('');
    } else {
      setClientSubmitError(result.error);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedKey = key.trim();
    const nextErrors: { client?: string; name?: string; key?: string } = {};
    if (!clientId || creatingClient) nextErrors.client = 'Choose a client';
    if (!trimmedName) nextErrors.name = 'Name is required';
    if (!trimmedKey) nextErrors.key = 'Key is required';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await createProject({ client_id: clientId, key: trimmedKey, name: trimmedName });
    setSubmitting(false);
    if (result.success) {
      await fetchProjects();
      onSuccess(result.project.id, result.project.name, result.project.key);
      onClose();
    } else {
      setSubmitError(result.error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/50 z-40" onClick={onClose} aria-hidden />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md rounded-xl shadow-xl border border-gray-200 overflow-hidden"
        style={{ backgroundColor: E3_WHITE }}
      >
        <div className="px-6 py-4 border-b flex items-center justify-between" style={{ backgroundColor: SPACE_BLUE }}>
          <h2 className="text-lg font-semibold" style={{ color: E3_WHITE }}>Create New Project</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded hover:bg-white/10 transition-colors" style={{ color: E3_WHITE }}>
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} noValidate className="p-6 space-y-4">
          <div>
            <FieldLabel htmlFor="project-client" className="block text-sm font-medium text-gray-700 mb-1" hintScope="Projects">
              Client <span className="text-red-500">*</span>
            </FieldLabel>
            {!creatingClient && (
              <select
                id="project-client"
                value={clientId}
                onChange={(e) => {
                  setClientId(e.target.value);
                  if (e.target.value) setErrors((prev) => ({ ...prev, client: undefined }));
                }}
                className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              >
                <option value="">Select a client…</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            )}
            {errors.client && <p className="text-xs text-red-600 mt-1">{creatingClient ? 'Finish creating the client first' : errors.client}</p>}
            {!creatingClient && (
              <p className="text-xs text-gray-500 mt-1">
                {clients.length === 0 ? 'No clients yet — ' : ''}
                <button
                  type="button"
                  onClick={() => setCreatingClient(true)}
                  className="text-[var(--brand-primary)] hover:underline"
                >
                  {clients.length === 0 ? 'create one now' : '+ New client'}
                </button>
              </p>
            )}
            {creatingClient && (
              <div className="mt-2 space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                <div>
                  <FieldLabel htmlFor="new-client-name" className="block text-xs font-medium text-gray-700 mb-1" hintScope="Projects">
                    Client name
                  </FieldLabel>
                  <Input
                    id="new-client-name"
                    type="text"
                    value={newClientName}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateClient(e); } }}
                    
                    onChange={(e) => setNewClientName(e.target.value)}
                    placeholder="Acme Corp"
                    className="w-full font-sans"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="new-client-key" className="block text-xs font-medium text-gray-700 mb-1" hintScope="Projects">
                    Client key (URL-safe)
                  </FieldLabel>
                  <Input
                    id="new-client-key"
                    type="text"
                    value={newClientKey}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void handleCreateClient(e); } }}
                    
                    onChange={(e) => setNewClientKey(e.target.value)}
                    placeholder="acme"
                    className="w-full font-mono"
                  />
                </div>
                {clientSubmitError && <p className="text-xs text-red-600">{clientSubmitError}</p>}
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="outline" size="sm" onClick={() => setCreatingClient(false)} disabled={clientSubmitting}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={handleCreateClient}
                    disabled={clientSubmitting || !newClientName.trim() || !newClientKey.trim()}
                  >
                    {clientSubmitting ? 'Creating…' : 'Create client'}
                  </Button>
                </div>
              </div>
            )}
          </div>
          <div>
            <FieldLabel htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-1" hintScope="Projects">
              Project Name <span className="text-red-500">*</span>
            </FieldLabel>
            <Input id="project-name" type="text" value={name} onChange={(e) => {
                const v = e.target.value;
                setName(v);
                if (!keyTouched) setKey(slugify(v));
              }}
              placeholder="e.g. Acme EU" className="w-full font-sans" autoFocus />
            {errors.name && <p className="text-xs text-red-600 mt-1">{errors.name}</p>}
          </div>
          <div>
            <FieldLabel htmlFor="project-key" className="block text-sm font-medium text-gray-700 mb-1" hintScope="Projects">
              Key (URL-safe) <span className="text-red-500">*</span>
            </FieldLabel>
            <Input id="project-key" type="text" value={key} onChange={(e) => { setKeyTouched(true); setKey(e.target.value); }} placeholder="acme-eu" className="w-full font-mono" />
            {errors.key && <p className="text-xs text-red-600 mt-1">{errors.key}</p>}
          </div>
          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{submitError}</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={submitting} className="flex-1 bg-[var(--brand-primary)] text-white hover:opacity-90">
              {submitting ? 'Creating…' : 'Create Project'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

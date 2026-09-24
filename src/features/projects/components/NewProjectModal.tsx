import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { useProjectShell } from '../context/ProjectShellContext';
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
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { fetchProjects, createProject } = useProjectShell();
  const { clients, fetchClients } = useClients();

  useEffect(() => {
    if (isOpen) {
      fetchClients();
      setName('');
      setKey('');
      setClientId('');
      setSubmitError(null);
    }
  }, [isOpen, fetchClients]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedKey = key.trim();
    if (!trimmedName || !trimmedKey || !clientId) return;
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="project-client" className="block text-sm font-medium text-gray-700 mb-1">
              Client <span className="text-red-500">*</span>
            </label>
            <select
              id="project-client"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900"
              required
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {clients.length === 0 && (
              <p className="text-xs text-gray-500 mt-1">No clients yet — create one from the Clients page first.</p>
            )}
          </div>
          <div>
            <label htmlFor="project-name" className="block text-sm font-medium text-gray-700 mb-1">
              Project Name <span className="text-red-500">*</span>
            </label>
            <Input id="project-name" type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Acme EU" className="w-full font-sans" required autoFocus />
          </div>
          <div>
            <label htmlFor="project-key" className="block text-sm font-medium text-gray-700 mb-1">
              Key (URL-safe) <span className="text-red-500">*</span>
            </label>
            <Input id="project-key" type="text" value={key} onChange={(e) => setKey(e.target.value)} placeholder="acme-eu" className="w-full font-mono" required />
          </div>
          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{submitError}</p>
          )}
          <div className="flex gap-3 pt-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">Cancel</Button>
            <Button type="submit" disabled={!name.trim() || !key.trim() || !clientId || submitting} className="flex-1 bg-[var(--brand-primary)] text-white hover:opacity-90">
              {submitting ? 'Creating…' : 'Create Project'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

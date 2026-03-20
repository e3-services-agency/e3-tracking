import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { useWorkspaces } from '../hooks/useWorkspaces';

const SPACE_BLUE = 'var(--e3-space-blue)';
const E3_WHITE = 'var(--e3-white)';

export interface NewWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (workspaceId: string, workspaceName: string, workspaceKey: string) => void;
}

export function NewWorkspaceModal({
  isOpen,
  onClose,
  onSuccess,
}: NewWorkspaceModalProps) {
  const [name, setName] = useState('');
  const [clientName, setClientName] = useState('');
  const [templateId, setTemplateId] = useState<string>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const { workspaces, isLoading, fetchWorkspaces, createWorkspace } = useWorkspaces();

  useEffect(() => {
    if (isOpen) {
      fetchWorkspaces();
      setName('');
      setClientName('');
      setTemplateId('');
      setSubmitError(null);
    }
  }, [isOpen, fetchWorkspaces]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    setSubmitting(true);
    setSubmitError(null);
    const result = await createWorkspace(
      trimmed,
      templateId || undefined,
      clientName.trim() || undefined
    );
    setSubmitting(false);
    if (result.success) {
      onSuccess(result.workspace.id, result.workspace.name, result.workspace.workspace_key);
      onClose();
    } else {
      setSubmitError(result.error);
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 bg-black/50 z-40"
        onClick={onClose}
        aria-hidden
      />
      <div
        className="fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md rounded-xl shadow-xl border border-gray-200 overflow-hidden"
        style={{ backgroundColor: E3_WHITE }}
      >
        <div
          className="px-6 py-4 border-b flex items-center justify-between"
          style={{ backgroundColor: SPACE_BLUE }}
        >
          <h2
            className="text-lg font-semibold"
            style={{ color: E3_WHITE }}
          >
            Create New Workspace
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded hover:bg-white/10 transition-colors"
            style={{ color: E3_WHITE }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label
              htmlFor="workspace-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Workspace Name <span className="text-red-500">*</span>
            </label>
            <Input
              id="workspace-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Acme Corp Tracking"
              className="w-full font-sans"
              required
              autoFocus
            />
          </div>
          <div>
            <label
              htmlFor="workspace-client-name"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Client Name (optional)
            </label>
            <Input
              id="workspace-client-name"
              type="text"
              value={clientName}
              onChange={(e) => setClientName(e.target.value)}
              placeholder="e.g. Acme Corp"
              className="w-full font-sans"
            />
            <p className="text-xs text-gray-500 mt-1">
              Used for portfolio grouping in the workspace switcher.
            </p>
          </div>
          <div>
            <label
              htmlFor="workspace-template"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Start from Template
            </label>
            <select
              id="workspace-template"
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-[var(--brand-primary)] focus:ring-1 focus:ring-[var(--brand-primary)]"
            >
              <option value="">Blank Workspace</option>
              {workspaces.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
            {isLoading && (
              <p className="text-xs text-gray-500 mt-1">Loading workspaces…</p>
            )}
          </div>
          {submitError && (
            <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">
              {submitError}
            </p>
          )}
          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!name.trim() || submitting}
              className="flex-1 bg-[var(--brand-primary)] text-white hover:opacity-90"
            >
              {submitting ? 'Creating…' : 'Create Workspace'}
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}

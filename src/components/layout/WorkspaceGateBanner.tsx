import React from 'react';
import { AlertCircle } from 'lucide-react';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';

type WorkspaceGateBannerProps = {
  /** When true, banner is hidden (e.g. main area already shows the same workspace-required message full-page). */
  suppress?: boolean;
};

/**
 * Optional narrow strip under the header. Suppress when the main area already shows the full-page workspace gate.
 */
export function WorkspaceGateBanner({ suppress }: WorkspaceGateBannerProps) {
  const { isLoading, gateMessage } = useWorkspaceShell();

  if (suppress) return null;
  if (isLoading || !gateMessage) {
    return null;
  }

  return (
    <div
      className="shrink-0 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-950"
      role="status"
    >
      <div className="flex items-start gap-3 max-w-4xl">
        <AlertCircle className="w-5 h-5 shrink-0 text-amber-700 mt-0.5" aria-hidden />
        <p className="leading-relaxed">{gateMessage}</p>
      </div>
    </div>
  );
}

/**
 * Full JSON backup download (D-45, T-3-04, Settings page): one file, the whole project including
 * embedded trigger images, via `GET /export/backup.json`. Simplified UI (D-07); restore (T-3-05)
 * is a separate task with its own Clients-page form.
 */
import React from 'react';
import { API_BASE } from '@/src/config/env';
import { Button } from '@/src/components/ui/Button';

function backupHref(projectId: string): string {
  return `${API_BASE}/api/projects/${projectId}/export/backup.json`;
}

/** Triggers a same-origin download without navigating away (a hidden, immediately-clicked anchor). */
function triggerDownload(href: string, filename: string): void {
  const a = document.createElement('a');
  a.href = href;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

export function BackupExportBlock({ projectId }: { projectId: string }) {
  if (!projectId) return null;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Backup</h2>
          <p className="text-sm text-gray-500">
            One self-contained JSON file: every table plus embedded trigger images. Restore lands on the Clients page.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => triggerDownload(backupHref(projectId), 'backup.json')}
        >
          Download backup
        </Button>
      </div>
    </div>
  );
}

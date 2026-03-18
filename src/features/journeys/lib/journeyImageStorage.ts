import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

function safeFilename(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9._-]/g, '');
}

export async function uploadJourneyStepImage(args: {
  journeyId: string;
  nodeId: string;
  file: File;
  workspaceId: string;
}): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    const ext = args.file.name?.includes('.') ? args.file.name.split('.').pop() : 'png';
    const name = safeFilename(args.file.name || `step.${ext}`);
    const file = new File([args.file], name, { type: args.file.type || 'image/png' });

    const form = new FormData();
    form.set('file', file);

    const resp = await fetchWithAuth(`${API_BASE}/api/journeys/${args.journeyId}/images`, {
      method: 'POST',
      headers: {
        // Let the browser set multipart boundary.
        'x-workspace-id': args.workspaceId,
      },
      body: form,
    });

    const body = (await resp.json().catch(() => null)) as null | { url?: string; error?: string };
    if (!resp.ok) {
      return { success: false, error: body?.error ?? `Upload failed (${resp.status})` };
    }
    const url = body?.url;
    if (!url) return { success: false, error: 'Upload succeeded but no URL returned.' };
    return { success: true, url };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Upload failed';
    return { success: false, error: msg };
  }
}


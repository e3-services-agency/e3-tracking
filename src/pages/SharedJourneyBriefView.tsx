/**
 * Public implementation brief view at /share/journey/:id/brief.
 * Fetches HTML from GET /api/shared/journeys/journey/:id/export/html and renders in an iframe.
 */
import React, { useEffect, useState } from 'react';
import { API_BASE } from '@/src/config/env';

export function SharedJourneyBriefView({ journeyId }: { journeyId: string }) {
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setHtml(null);
    setError(null);
    fetch(`${API_BASE}/api/shared/journeys/journey/${journeyId}/export/html`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            typeof (body as any)?.error === 'string'
              ? (body as any).error
              : res.statusText || 'Failed to load brief';
          throw new Error(msg);
        }
        return res.text();
      })
      .then((t) => {
        if (cancelled) return;
        setHtml(t);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : 'Failed to load brief');
      });
    return () => {
      cancelled = true;
    };
  }, [journeyId]);

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-default)]">
        <div className="text-center max-w-md px-4">
          <p className="text-red-600 font-medium">Failed to load brief</p>
          <p className="text-sm text-gray-600 mt-1">{error}</p>
        </div>
      </div>
    );
  }

  if (!html) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-default)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading implementation brief…</p>
        </div>
      </div>
    );
  }

  return (
    <iframe
      title="Implementation brief"
      className="w-full h-screen border-0 bg-white"
      srcDoc={html}
    />
  );
}


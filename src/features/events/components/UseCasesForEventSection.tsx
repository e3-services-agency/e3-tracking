/**
 * Read-only list of use cases referencing this event (directly, or via one of its variants) in the
 * event editor (T-1-07 acceptance: "event editor lists the use cases that reference the event or
 * its variants (read-only)"). Editing happens on the Use cases page.
 */
import React, { useEffect, useState } from 'react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

interface UseCaseOption {
  id: string;
  code: string | null;
  name: string;
  status: string | null;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function UseCasesForEventSection({ projectId, eventId }: { projectId: string; eventId: string }) {
  const [useCases, setUseCases] = useState<UseCaseOption[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/events/${eventId}/use-cases`);
      const data = await parseJson(res);
      if (!cancelled) {
        if (res.ok) setUseCases(Array.isArray(data) ? data : []);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId, eventId]);

  if (loading) return null;

  return (
    <div className="space-y-2 border-t pt-4">
      <h3 className="text-sm font-semibold text-gray-900">Use cases</h3>
      {useCases.length === 0 ? (
        <p className="text-sm text-gray-500">No use case references this event or its variants yet.</p>
      ) : (
        <ul className="text-sm text-gray-700 space-y-1">
          {useCases.map((uc) => (
            <li key={uc.id} className="flex items-center gap-2">
              <span className="font-medium">{uc.code ? `${uc.code} — ${uc.name}` : uc.name}</span>
              {uc.status && <span className="text-xs text-gray-500">({uc.status})</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

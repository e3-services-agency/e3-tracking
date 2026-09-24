/**
 * Clients CRUD (D-27). List, create, update; delete only allowed when the client owns no
 * projects (backend 409s otherwise).
 */
import { useState, useCallback, useEffect } from 'react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

export interface ClientRow {
  id: string;
  key: string;
  name: string;
  bloomreach_account_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

async function parseJson(res: Response): Promise<any> {
  return res.json().catch(() => ({}));
}

export function useClients() {
  const [clients, setClients] = useState<ClientRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchClients = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/clients`, { headers: { Accept: 'application/json' } });
      const data = await parseJson(res);
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Failed to fetch clients');
        setClients([]);
        return;
      }
      setClients(Array.isArray(data) ? (data as ClientRow[]) : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
      setClients([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const createClient = useCallback(
    async (input: { key: string; name: string; bloomreach_account_id?: string; notes?: string }) => {
      const res = await fetchWithAuth(`${API_BASE}/api/clients`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        return { success: false as const, error: typeof data?.error === 'string' ? data.error : 'Failed to create client' };
      }
      const client = data as ClientRow;
      setClients((prev) => [...prev, client].sort((a, b) => a.name.localeCompare(b.name)));
      return { success: true as const, client };
    },
    []
  );

  const updateClient = useCallback(
    async (id: string, input: Partial<{ key: string; name: string; bloomreach_account_id: string | null; notes: string | null }>) => {
      const res = await fetchWithAuth(`${API_BASE}/api/clients/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      const data = await parseJson(res);
      if (!res.ok) {
        return { success: false as const, error: typeof data?.error === 'string' ? data.error : 'Failed to update client' };
      }
      const client = data as ClientRow;
      setClients((prev) => prev.map((c) => (c.id === id ? client : c)));
      return { success: true as const, client };
    },
    []
  );

  const deleteClient = useCallback(async (id: string) => {
    const res = await fetchWithAuth(`${API_BASE}/api/clients/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await parseJson(res);
      return { success: false as const, error: typeof data?.error === 'string' ? data.error : 'Failed to delete client' };
    }
    setClients((prev) => prev.filter((c) => c.id !== id));
    return { success: true as const };
  }, []);

  return { clients, isLoading, error, fetchClients, createClient, updateClient, deleteClient };
}

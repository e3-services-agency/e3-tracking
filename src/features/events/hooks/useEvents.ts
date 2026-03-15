/**
 * API hooks for Events. Uses centralized fetchWithAuth (adds Bearer token, handles 401 → redirect to login).
 */
import { useState, useCallback, useEffect } from 'react';
import { useStore } from '@/src/store';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import type {
  EventRow,
  CreateEventInput,
  EventPropertyPresence,
} from '@/src/types/schema';

export const MOCK_WORKSPACE_ID = '00000000-0000-0000-0000-000000000000';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: string;
  resource?: string;
}

/** Event with attached property count (from GET /api/events). */
export interface EventWithPropertyCount extends EventRow {
  attached_property_count: number;
}

/** Attached property with name (from GET /api/events/:id). */
export interface EventPropertyWithDetails {
  event_id: string;
  property_id: string;
  presence: EventPropertyPresence;
  created_at: string;
  updated_at: string;
  property_name: string;
}

export interface EventWithPropertiesResponse {
  event: EventRow;
  attached_properties: EventPropertyWithDetails[];
}

async function parseErrorResponse(res: Response): Promise<ApiError> {
  const body = await res.json().catch(() => ({}));
  const message =
    typeof body?.error === 'string' ? body.error : res.statusText || 'Request failed';
  return {
    status: res.status,
    code: body?.code ?? 'UNKNOWN',
    message,
    details: body?.details,
    resource: body?.resource,
  };
}

export interface UseEventsResult {
  events: EventWithPropertyCount[];
  isLoading: boolean;
  error: ApiError | null;
  refetch: () => Promise<void>;
  createEvent: (
    payload: CreateEventInput
  ) => Promise<
    | { success: true; data: EventRow }
    | { success: false; error: ApiError }
  >;
  attachProperty: (
    eventId: string,
    propertyId: string,
    presence: EventPropertyPresence
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  updatePresence: (
    eventId: string,
    propertyId: string,
    presence: EventPropertyPresence
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  getEventWithProperties: (
    eventId: string
  ) => Promise<EventWithPropertiesResponse | null>;
  mutationError: ApiError | null;
  clearMutationError: () => void;
}

export function useEvents(
  workspaceId?: string
): UseEventsResult {
  const activeWorkspaceId = useStore((s) => s.activeWorkspaceId);
  const effectiveWorkspaceId = workspaceId ?? activeWorkspaceId ?? MOCK_WORKSPACE_ID;

  const [events, setEvents] = useState<EventWithPropertyCount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<ApiError | null>(null);
  const [mutationError, setMutationError] = useState<ApiError | null>(null);

  const refetch = useCallback(async () => {
    setError(null);
    setIsLoading(true);
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/events`, {
        headers: { 'x-workspace-id': effectiveWorkspaceId },
      });
      if (!res.ok) {
        setError(await parseErrorResponse(res));
        setEvents([]);
        return;
      }
      const data = (await res.json()) as EventWithPropertyCount[];
      setEvents(Array.isArray(data) ? data : []);
    } catch (err) {
      setError({
        status: 0,
        code: 'NETWORK_ERROR',
        message:
          err instanceof Error ? err.message : 'Failed to fetch events.',
      });
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [effectiveWorkspaceId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  const createEvent = useCallback(
    async (
      payload: CreateEventInput
    ): Promise<
      | { success: true; data: EventRow }
      | { success: false; error: ApiError }
    > => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/events`, {
          method: 'POST',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));

        if (res.status === 201 && body?.id) {
          const created = body as EventRow;
          setEvents((prev) =>
            [...prev, { ...created, attached_property_count: 0 }].sort((a, b) =>
              a.name.localeCompare(b.name)
            )
          );
          return { success: true, data: created };
        }

        const apiError: ApiError = {
          status: res.status,
          code: body?.code ?? 'UNKNOWN',
          message:
            typeof body?.error === 'string' ? body.error : res.statusText || 'Request failed',
          details: body?.details,
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      } catch (err) {
        const apiError: ApiError = {
          status: 0,
          code: 'NETWORK_ERROR',
          message:
            err instanceof Error ? err.message : 'Failed to create event.',
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      }
    },
    [effectiveWorkspaceId]
  );

  const attachProperty = useCallback(
    async (
      eventId: string,
      propertyId: string,
      presence: EventPropertyPresence
    ): Promise<{ success: true } | { success: false; error: ApiError }> => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/events/${eventId}/properties`, {
          method: 'POST',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
          body: JSON.stringify({ propertyId, presence }),
        });
        const body = await res.json().catch(() => ({}));

        if (res.ok && res.status === 201) {
          await refetch();
          return { success: true };
        }

        const apiError: ApiError = {
          status: res.status,
          code: body?.code ?? 'UNKNOWN',
          message:
            typeof body?.error === 'string' ? body.error : res.statusText || 'Request failed',
          details: body?.details,
          resource: body?.resource,
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      } catch (err) {
        const apiError: ApiError = {
          status: 0,
          code: 'NETWORK_ERROR',
          message:
            err instanceof Error ? err.message : 'Failed to attach property.',
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      }
    },
    [effectiveWorkspaceId, refetch]
  );

  const updatePresence = useCallback(
    async (
      eventId: string,
      propertyId: string,
      presence: EventPropertyPresence
    ): Promise<{ success: true } | { success: false; error: ApiError }> => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/events/${eventId}/properties`, {
          method: 'PATCH',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
          body: JSON.stringify({ propertyId, presence }),
        });
        const body = await res.json().catch(() => ({}));

        if (res.ok) {
          return { success: true };
        }

        const apiError: ApiError = {
          status: res.status,
          code: body?.code ?? 'UNKNOWN',
          message:
            typeof body?.error === 'string' ? body.error : res.statusText || 'Request failed',
          details: body?.details,
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      } catch (err) {
        const apiError: ApiError = {
          status: 0,
          code: 'NETWORK_ERROR',
          message:
            err instanceof Error ? err.message : 'Failed to update presence.',
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      }
    },
    [effectiveWorkspaceId]
  );

  const getEventWithProperties = useCallback(
    async (eventId: string): Promise<EventWithPropertiesResponse | null> => {
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/events/${eventId}`, {
          headers: { 'x-workspace-id': effectiveWorkspaceId },
        });
        if (!res.ok) return null;
        const data = (await res.json()) as EventWithPropertiesResponse;
        return data;
      } catch {
        return null;
      }
    },
    [effectiveWorkspaceId]
  );

  const clearMutationError = useCallback(() => setMutationError(null), []);

  return {
    events,
    isLoading,
    error,
    refetch,
    createEvent,
    attachProperty,
    updatePresence,
    getEventWithProperties,
    mutationError,
    clearMutationError,
  };
}

/**
 * API hooks for Events. Uses centralized fetchWithAuth (adds Bearer token, handles 401 → redirect to login).
 */
import { useState, useCallback, useEffect } from 'react';
import { useWorkspaceShell } from '@/src/features/workspaces/context/WorkspaceShellContext';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import type {
  CreateEventInput,
  EffectiveEventPropertyDefinition,
  EventPropertyDefinitionRow,
  EventPropertyDefinitionUpsertPayload,
  EventPropertyPresence,
  EventRow,
} from '@/src/types/schema';

export const MOCK_WORKSPACE_ID = '00000000-0000-0000-0000-000000000001';

export interface ApiError {
  status: number;
  code: string;
  message: string;
  details?: string;
  resource?: string;
  field?: string;
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
  source_ids: string[];
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
  updateEvent: (
    eventId: string,
    payload: CreateEventInput
  ) => Promise<
    | { success: true; data: EventRow }
    | { success: false; error: ApiError }
  >;
  deleteEvent: (
    eventId: string
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  attachProperty: (
    eventId: string,
    propertyId: string,
    presence: EventPropertyPresence
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  detachProperty: (
    eventId: string,
    propertyId: string
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  updatePresence: (
    eventId: string,
    propertyId: string,
    presence: EventPropertyPresence
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  getEventWithProperties: (
    eventId: string
  ) => Promise<EventWithPropertiesResponse | null>;
  getEffectivePropertyDefinitions: (
    eventId: string
  ) => Promise<
    | { success: true; items: EffectiveEventPropertyDefinition[] }
    | { success: false; error: ApiError }
  >;
  putEventPropertyDefinitions: (
    eventId: string,
    definitions: EventPropertyDefinitionUpsertPayload[]
  ) => Promise<
    | { success: true; definitions: EventPropertyDefinitionRow[] }
    | { success: false; error: ApiError }
  >;
  deleteEventPropertyDefinition: (
    eventId: string,
    propertyId: string
  ) => Promise<{ success: true } | { success: false; error: ApiError }>;
  mutationError: ApiError | null;
  clearMutationError: () => void;
}

export function useEvents(
  workspaceId?: string
): UseEventsResult {
  const { activeWorkspaceId } = useWorkspaceShell();
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

  const updateEvent = useCallback(
    async (
      eventId: string,
      payload: CreateEventInput
    ): Promise<
      | { success: true; data: EventRow }
      | { success: false; error: ApiError }
    > => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/events/${eventId}`, {
          method: 'PATCH',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
          body: JSON.stringify(payload),
        });
        const body = await res.json().catch(() => ({}));

        if (res.ok && body?.id) {
          const updated = body as EventRow;
          setEvents((prev) =>
            prev
              .map((event) =>
                event.id === eventId
                  ? { ...event, ...updated }
                  : event
              )
              .sort((a, b) => a.name.localeCompare(b.name))
          );
          return { success: true, data: updated };
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
            err instanceof Error ? err.message : 'Failed to update event.',
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      }
    },
    [effectiveWorkspaceId]
  );

  const deleteEvent = useCallback(
    async (
      eventId: string
    ): Promise<{ success: true } | { success: false; error: ApiError }> => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/events/${eventId}`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
        });

        if (res.status === 204) {
          setEvents((prev) => prev.filter((event) => event.id !== eventId));
          return { success: true };
        }

        const body = await res.json().catch(() => ({}));
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
            err instanceof Error ? err.message : 'Failed to delete event.',
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

  const detachProperty = useCallback(
    async (
      eventId: string,
      propertyId: string
    ): Promise<{ success: true } | { success: false; error: ApiError }> => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(`${API_BASE}/api/events/${eventId}/properties`, {
          method: 'DELETE',
          headers: { 'x-workspace-id': effectiveWorkspaceId },
          body: JSON.stringify({ propertyId }),
        });

        if (res.status === 204) {
          await refetch();
          return { success: true };
        }

        const apiError = await parseErrorResponse(res);
        setMutationError(apiError);
        return { success: false, error: apiError };
      } catch (err) {
        const apiError: ApiError = {
          status: 0,
          code: 'NETWORK_ERROR',
          message:
            err instanceof Error ? err.message : 'Failed to detach property.',
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      }
    },
    [effectiveWorkspaceId, refetch]
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

  const getEffectivePropertyDefinitions = useCallback(
    async (
      eventId: string
    ): Promise<
      | { success: true; items: EffectiveEventPropertyDefinition[] }
      | { success: false; error: ApiError }
    > => {
      try {
        const res = await fetchWithAuth(
          `${API_BASE}/api/events/${eventId}/property-definitions/effective`,
          {
            headers: { 'x-workspace-id': effectiveWorkspaceId },
          }
        );
        if (!res.ok) {
          return { success: false, error: await parseErrorResponse(res) };
        }
        const body = (await res.json()) as { items?: unknown };
        const raw = body.items;
        const items = Array.isArray(raw) ? (raw as EffectiveEventPropertyDefinition[]) : [];
        return { success: true, items };
      } catch (err) {
        return {
          success: false,
          error: {
            status: 0,
            code: 'NETWORK_ERROR',
            message:
              err instanceof Error ? err.message : 'Failed to load effective property definitions.',
          },
        };
      }
    },
    [effectiveWorkspaceId]
  );

  const putEventPropertyDefinitions = useCallback(
    async (
      eventId: string,
      definitions: EventPropertyDefinitionUpsertPayload[]
    ): Promise<
      { success: true; definitions: EventPropertyDefinitionRow[] } | { success: false; error: ApiError }
    > => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(
          `${API_BASE}/api/events/${eventId}/property-definitions`,
          {
            method: 'PUT',
            headers: {
              'x-workspace-id': effectiveWorkspaceId,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ definitions }),
          }
        );
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
          const apiError: ApiError = {
            status: res.status,
            code: body?.code ?? 'UNKNOWN',
            message:
              typeof body?.error === 'string' ? body.error : res.statusText || 'Request failed',
            details: body?.details,
            field: body?.field,
          };
          setMutationError(apiError);
          return { success: false, error: apiError };
        }
        const defs = Array.isArray(body.definitions)
          ? (body.definitions as EventPropertyDefinitionRow[])
          : [];
        return { success: true, definitions: defs };
      } catch (err) {
        const apiError: ApiError = {
          status: 0,
          code: 'NETWORK_ERROR',
          message:
            err instanceof Error ? err.message : 'Failed to save property definitions.',
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      }
    },
    [effectiveWorkspaceId]
  );

  const deleteEventPropertyDefinition = useCallback(
    async (
      eventId: string,
      propertyId: string
    ): Promise<{ success: true } | { success: false; error: ApiError }> => {
      setMutationError(null);
      try {
        const res = await fetchWithAuth(
          `${API_BASE}/api/events/${eventId}/property-definitions/${propertyId}`,
          {
            method: 'DELETE',
            headers: { 'x-workspace-id': effectiveWorkspaceId },
          }
        );
        if (res.status === 204) {
          return { success: true };
        }
        const apiError = await parseErrorResponse(res);
        setMutationError(apiError);
        return { success: false, error: apiError };
      } catch (err) {
        const apiError: ApiError = {
          status: 0,
          code: 'NETWORK_ERROR',
          message:
            err instanceof Error ? err.message : 'Failed to delete property definition override.',
        };
        setMutationError(apiError);
        return { success: false, error: apiError };
      }
    },
    [effectiveWorkspaceId]
  );

  return {
    events,
    isLoading,
    error,
    refetch,
    createEvent,
    updateEvent,
    deleteEvent,
    attachProperty,
    detachProperty,
    updatePresence,
    getEventWithProperties,
    getEffectivePropertyDefinitions,
    putEventPropertyDefinitions,
    deleteEventPropertyDefinition,
    mutationError,
    clearMutationError,
  };
}

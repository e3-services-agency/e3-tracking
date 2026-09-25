/**
 * Bloomreach platform limits (D-38, T-2-12): 255 event types per project, 255 properties per
 * event. `event.dal.ts` enforces these at write time (`LIMIT_EVENT_TYPES` /
 * `LIMIT_EVENT_PROPERTIES`, 400); this module computes the same counts read-only for display —
 * the tracking document's `limits` block (T-2-08) and, later, any UI badge that warns before the
 * limit is actually hit.
 */
import { getDb } from '../db';
import { BLOOMREACH_LIMITS } from '../../domain/bloomreach';

export interface EventTypeLimitSummary {
  count: number;
  limit: number;
  overLimit: boolean;
}

export interface EventPropertyLimitSummary {
  event_id: string;
  event_name: string;
  count: number;
  limit: number;
  overLimit: boolean;
}

/** Live (non-deleted) event count for the project against `BLOOMREACH_LIMITS.MAX_EVENT_TYPES_PER_PROJECT`. */
export function getEventTypeLimitSummary(projectId: string): EventTypeLimitSummary {
  const { n } = getDb()
    .prepare('SELECT COUNT(*) as n FROM events WHERE project_id = ? AND deleted_at IS NULL')
    .get(projectId) as { n: number };
  return {
    count: n,
    limit: BLOOMREACH_LIMITS.MAX_EVENT_TYPES_PER_PROJECT,
    overLimit: n > BLOOMREACH_LIMITS.MAX_EVENT_TYPES_PER_PROJECT,
  };
}

/** Attached-property count per live event against `BLOOMREACH_LIMITS.MAX_PROPERTIES_PER_EVENT`. */
export function getEventPropertyLimitSummaries(projectId: string): EventPropertyLimitSummary[] {
  const rows = getDb()
    .prepare(
      `SELECT e.id as event_id, e.name as event_name, COUNT(ep.property_id) as n
       FROM events e
       LEFT JOIN event_properties ep ON ep.event_id = e.id
       WHERE e.project_id = ? AND e.deleted_at IS NULL
       GROUP BY e.id, e.name
       ORDER BY e.name`
    )
    .all(projectId) as { event_id: string; event_name: string; n: number }[];
  return rows.map((row) => ({
    event_id: row.event_id,
    event_name: row.event_name,
    count: row.n,
    limit: BLOOMREACH_LIMITS.MAX_PROPERTIES_PER_EVENT,
    overLimit: row.n > BLOOMREACH_LIMITS.MAX_PROPERTIES_PER_EVENT,
  }));
}

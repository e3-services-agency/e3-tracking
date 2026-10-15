/**
 * The portal overview's figures (T-5-43, D-88 plan section 5). Pure. Everything comes from the
 * document summary, the public comment list and the public history rows; nothing else is read.
 */
import type { TrackingDocumentSummary } from '../../domain/document/trackingDocument';
import { EVENT_STATUSES, type CommentEntityType, type EventStatus } from '../../domain/enums';
import type { CommentPanelRow } from '../comments/CommentsPanel';
import { commentFragment } from '../comments/commentLinks';
import { commentTargetView, type PortalIndex, type PortalTarget } from './portalModel';

/** Custom events per status (planned, in review, implemented; ignored only when present). */
export function customEventStatusCounts(doc: TrackingDocumentSummary): { status: EventStatus; count: number }[] {
  const custom = doc.events.filter((e) => e.class === 'custom');
  return EVENT_STATUSES.map((status) => ({ status, count: custom.filter((e) => e.status === status).length })).filter(
    (s) => s.status !== 'ignored' || s.count > 0
  );
}

/** Certified events out of the events certification applies to (custom events, D-34). */
export function certificationCounts(doc: TrackingDocumentSummary): { certified: number; applicable: number } {
  const applicable = doc.events.filter((e) => e.certification.applicable);
  return { certified: applicable.filter((e) => e.certification.certified).length, applicable: applicable.length };
}

/** Display name of a comment or history target, from the summary. */
export function targetName(doc: TrackingDocumentSummary, index: PortalIndex, entityType: string, entityId: string): string | null {
  switch (entityType) {
    case 'event':
      return index.eventNameById.get(entityId) ?? null;
    case 'property':
    case 'property_definition': {
      const propertyId = entityType === 'property' ? entityId : index.propertyIdByDefinitionId.get(entityId);
      return [...doc.properties, ...(doc.event_properties ?? [])].find((p) => p.property_id === propertyId)?.name ?? null;
    }
    case 'use_case':
    case 'requirement': {
      const useCaseId = entityType === 'use_case' ? entityId : index.useCaseIdByRequirementId.get(entityId);
      return doc.use_cases.find((u) => u.id === useCaseId)?.name ?? null;
    }
    case 'identity_rule':
      return doc.identity_rules.find((r) => r.id === entityId)?.name ?? null;
    case 'catalog':
      return doc.catalogs.find((c) => (c.id ?? c.name) === entityId)?.name ?? null;
    default:
      return null;
  }
}

export const TARGET_KIND_NAMES: Record<string, string> = {
  event: 'Event',
  property: 'Property',
  property_definition: 'Property',
  use_case: 'Use case',
  requirement: 'Use case requirement',
  identity_rule: 'Identity rule',
  catalog: 'Catalog',
  catalog_field: 'Catalog field',
  finding: 'QA finding',
  qa_report: 'QA report',
};

export interface WaitingThread {
  id: string;
  kind: string;
  /** Target name; null when the summary has no name for it (a finding, a report). */
  name: string | null;
  /** Portal location of the thread, with its comment link; null when the target is not in this share. */
  target: PortalTarget | null;
  author: string;
  body: string;
  replies: number;
  /** Latest activity in the thread (root or reply). */
  lastAt: string;
}

/**
 * Open root threads, newest activity first. Internal-only rows are dropped again here even though
 * the public route never returns them.
 */
export function waitingThreads(rows: readonly CommentPanelRow[], doc: TrackingDocumentSummary, index: PortalIndex): WaitingThread[] {
  const visible = rows.filter((c) => !c.internal_only);
  const threads: WaitingThread[] = [];
  for (const root of visible) {
    if (root.parent_id || root.status !== 'open' || !root.entity_type || !root.entity_id) continue;
    const replies = visible.filter((c) => c.parent_id === root.id);
    const lastAt = [root, ...replies].map((c) => c.created_at).sort().at(-1)!;
    const link = { entityType: root.entity_type as CommentEntityType, entityId: root.entity_id, threadId: root.id, commentId: root.id };
    let target: PortalTarget | null = null;
    try {
      const view = commentTargetView(link, index);
      target = view ? { ...view, hash: commentFragment(link) } : null;
    } catch {
      target = null;
    }
    threads.push({
      id: root.id,
      kind: TARGET_KIND_NAMES[root.entity_type] ?? root.entity_type,
      name: targetName(doc, index, root.entity_type, root.entity_id),
      target,
      author: root.author_name,
      body: root.body,
      replies: replies.length,
      lastAt,
    });
  }
  return threads.sort((a, b) => (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0));
}

/** One row of `GET /api/shared/:token/history` (project-wide form). */
export interface PublicChange {
  id: string;
  entity_type: string;
  entity_id: string;
  entity_label: string;
  action: string;
  changed_at: string;
  diff_json: { field: string }[];
}

export interface RecentChange {
  id: string;
  kind: string;
  name: string;
  target: PortalTarget | null;
  action: string;
  /** Changed fields in words: "description, allowed values". */
  fields: string;
  at: string;
}

const fieldWords = (field: string) => field.replace(/_json$/, '').replace(/_/g, ' ');

export function recentChanges(rows: readonly PublicChange[], doc: TrackingDocumentSummary, index: PortalIndex): RecentChange[] {
  return rows.map((row) => {
    let target: PortalTarget | null;
    if (row.entity_type === 'catalog_field') target = { view: 'catalogs', id: null };
    else target = commentTargetView({ entityType: row.entity_type as CommentEntityType, entityId: row.entity_id, threadId: row.id, commentId: row.id }, index);
    return {
      id: row.id,
      kind: TARGET_KIND_NAMES[row.entity_type] ?? row.entity_type,
      name: targetName(doc, index, row.entity_type, row.entity_id) ?? row.entity_label,
      target,
      action: row.action,
      fields: [...new Set(row.diff_json.map((d) => fieldWords(d.field)))].join(', '),
      at: row.changed_at,
    };
  });
}

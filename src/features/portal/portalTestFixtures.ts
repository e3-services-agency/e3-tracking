/**
 * Test-only helpers for mounted client portal tests (T-5-42): serve a public `TrackingDocument`
 * through the routes the portal reads (`/:token`, `document-summary.json`, `findings.json`,
 * `events/:id/card.json`, `comments`, `qa-reports`, `identity`, history), recording every request.
 */
import type { TrackingDocument, TrackingDocumentSummary } from '@/src/domain/document/trackingDocument';

/** The summary the T-5-41 route builds (`toTrackingDocumentSummary`), from a test document. */
export function toSummary(doc: Partial<TrackingDocument>): TrackingDocumentSummary {
  return {
    generated_at: '2026-10-15T08:00:00Z',
    ...doc,
    events: (doc.events ?? []).map((e) => ({
      id: e.id,
      name: e.name,
      business_name: e.business_name,
      class: e.class,
      implementation_method: e.implementation_method,
      status: e.status,
      priority: e.priority,
      description: e.description,
      sources: e.sources,
      identifiers: e.identifiers,
      certification: e.certification,
      quality: e.quality,
      expiration: e.expiration,
      variant_names: (e.variants ?? []).map((v) => v.name),
      property_count: (e.properties ?? []).length,
      open_finding_count: (e.findings ?? []).length,
    })),
  } as TrackingDocumentSummary;
}

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

export interface PortalFetchOptions {
  doc: () => Partial<TrackingDocument>;
  comments?: () => unknown[];
  /** Rows of the project-wide history (`/history?limit=…`, the overview's recent changes). */
  history?: () => unknown[];
  access?: 'read' | 'comment';
  /** Status of the share header route (404 = revoked or unknown link). */
  status?: number;
  requested?: string[];
}

export function portalFetch({ doc, comments = () => [], history = () => [], access = 'read', status = 200, requested = [] }: PortalFetchOptions) {
  return async (url: string | URL | Request) => {
    const address = String(url);
    requested.push(address);
    const d = doc();
    if (status !== 200) return json({ error: 'This share link is not valid.', code: 'SHARE_NOT_FOUND' }, status);
    if (address.endsWith('/document-summary.json')) return json(toSummary(d));
    if (address.endsWith('/findings.json')) {
      return json({
        events: (d.events ?? []).filter((e) => e.findings.length > 0).map((e) => ({ id: e.id, name: e.name, findings: e.findings })),
        unattached_findings: d.unattached_findings ?? [],
      });
    }
    const card = address.match(/\/events\/([^/]+)\/card\.json$/);
    if (card) {
      const event = (d.events ?? []).find((e) => e.id === decodeURIComponent(card[1]));
      return event ? json(event) : json({ error: 'This share link is not valid.', code: 'SHARE_NOT_FOUND' }, 404);
    }
    if (address.endsWith('/comments')) return json(comments());
    if (/\/history\?limit=\d+$/.test(address)) return json({ rows: history(), next_cursor: null });
    if (address.endsWith('/qa-reports')) return json([]);
    if (address.endsWith('/history')) return json({ current_status: 'open', current_acknowledged: false, appearances: [] });
    if (address.endsWith('/identity')) return json({ name: 'Blue Fox', kind: 'guest', verified: false, avatar_url: null, name_chosen: false });
    return json({ project: { name: 'Shared project complete name', client_logo_path: null }, client: { name: 'Public client' }, access, generated_at: null });
  };
}

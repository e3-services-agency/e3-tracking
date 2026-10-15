/**
 * T-5-42 (D-88): old single-page links redirect to their view and item, indefinitely. One case per
 * anchor kind the old page produced (`references.ts`, `viewHelpers.ts`, findings) and per comment
 * target type (`commentLinks.ts`).
 */
import { describe, expect, it } from 'vitest';
import type { TrackingDocumentSummary } from '../../domain/document/trackingDocument';
import { buildReferenceIndex, resolveReference } from '../shared/references';
import { commentFragment, type CommentLinkTarget } from '../comments/commentLinks';
import { PROJECT_FINDINGS } from '../shared/sharedFindingsModel';
import {
  buildPortalIndex,
  commentTargetView,
  findingNavigationForAnchor,
  legacyAnchorTarget,
  portalViewOf,
  resolveHash,
  sameTarget,
  targetForAnchorHref,
} from './portalModel';

const summary = {
  events: [
    { id: 'e1', name: 'purchase', class: 'custom' },
    { id: 'e2', name: 'cart update', class: 'custom' },
    { id: 'e3', name: 'page.view', class: 'sdk' },
  ],
  properties: [{ property_id: 'p1', name: 'loyalty_points', definitions: [{ id: 'd1', name: 'general' }] }],
  event_properties: [
    { property_id: 'p2', name: 'loyalty_points', definitions: [] },
    { property_id: 'p3', name: 'total price', definitions: [{ id: 'd3', name: 'general' }] },
  ],
  use_cases: [
    { id: 'u1', code: 'UC-01', name: 'Welcome', type: 'marketing', requirements: [{ id: 'q1' }] },
    { id: 'u2', code: null, name: 'Loose', type: null, requirements: [] },
  ],
  identity_rules: [{ id: 'r1', name: 'Email at login', identifier_name: 'email_id' }],
  catalogs: [{ id: 'c1', name: 'products de' }, { name: 'legacy' }],
  consent_categories: [{ id: 'k1', name: 'Newsletter', standard_key: 'newsletter' }],
  standard_event_mappings: [
    { standard_event: 'purchase', event_name: 'purchase', variant_name: null, field_map: {} },
    { standard_event: 'purchase', event_name: 'purchase', variant_name: 'purchase[type=pos]', field_map: {} },
  ],
  findings_summary: { open: { error: 0, warning: 0, info: 0 }, by_comparison: {} },
  unattached_findings: [],
} as unknown as TrackingDocumentSummary;

const index = buildPortalIndex(summary);

describe('portal views', () => {
  it('reads the view segment; nothing or an unknown segment is the overview', () => {
    expect(portalViewOf('events')).toBe('events');
    expect(portalViewOf('standard-events')).toBe('standard-events');
    expect(portalViewOf(null)).toBe('overview');
    expect(portalViewOf('nope')).toBe('overview');
  });
});

describe('old single-page anchors (every kind) land on their view and item', () => {
  it.each([
    ['event-purchase', { view: 'events', id: 'purchase' }],
    ['event-cart-update', { view: 'events', id: 'cart update' }],
    ['event-page.view', { view: 'events', id: 'page.view' }],
    ['variants-event-purchase', { view: 'events', id: 'purchase', hash: '#variants-event-purchase' }],
    ['property-loyalty_points', { view: 'properties', id: 'loyalty_points' }],
    ['property-loyalty_points-2', { view: 'properties', id: 'loyalty_points-2' }],
    ['property-total-price', { view: 'properties', id: 'total-price' }],
    ['catalog-products-de', { view: 'catalogs', id: 'products-de' }],
    ['catalog-legacy', { view: 'catalogs', id: 'legacy' }],
    ['consent-Newsletter', { view: 'consents', id: 'Newsletter' }],
    [`mapping-${index.mappingSlugs[0]}`, { view: 'standard-events', id: index.mappingSlugs[0] }],
    ['use-case-UC-01', { view: 'use-cases', id: 'UC-01' }],
    ['use-case-Loose', { view: 'use-cases', id: 'u2' }],
    ['events', { view: 'events', id: null }],
    ['events-custom', { view: 'events', id: null }],
    ['properties', { view: 'properties', id: null }],
    ['properties-customer', { view: 'properties', id: null }],
    ['properties-event-item', { view: 'properties', id: null }],
    ['use-cases', { view: 'use-cases', id: null }],
    ['use-cases-marketing', { view: 'use-cases', id: null }],
    ['identity', { view: 'identity', id: null }],
    ['consents', { view: 'consents', id: null }],
    ['consents-email', { view: 'consents', id: null }],
    ['catalogs', { view: 'catalogs', id: null }],
    ['mapping', { view: 'standard-events', id: null }],
    ['findings', { view: 'qa', id: null, hash: '#findings' }],
    ['findings-definition_vs_observations', { view: 'qa', id: null, hash: '#findings-definition_vs_observations' }],
    ['findings-definition_vs_observations-event-purchase', { view: 'qa', id: null, hash: '#findings-definition_vs_observations-event-purchase' }],
    ['current-finding-f1', { view: 'qa', id: null, hash: '#current-finding-f1' }],
    ['current-findings-table', { view: 'qa', id: null, hash: '#current-findings-table' }],
    ['finding-f1', { view: 'qa', id: null, hash: '#finding-f1' }],
    ['qa-reports', { view: 'qa', id: null, hash: '#qa-reports' }],
  ])('#%s', (anchor, expected) => {
    expect(legacyAnchorTarget(anchor, index)).toEqual(expected);
  });

  it('the two mappings of one standard event get their own items', () => {
    const a = legacyAnchorTarget(`mapping-${index.mappingSlugs[0]}`, index)!;
    const b = legacyAnchorTarget(`mapping-${index.mappingSlugs[1]}`, index)!;
    expect(a.id).not.toBe(b.id);
    expect(index.mappingIndexBySlug.get(b.id!)).toBe(1);
  });

  it('an anchor naming an item that is gone lands on its list; an unknown anchor is ignored', () => {
    expect(legacyAnchorTarget('event-deleted', index)).toEqual({ view: 'events', id: null });
    expect(legacyAnchorTarget('property-gone', index)).toEqual({ view: 'properties', id: null });
    expect(legacyAnchorTarget('catalog-gone', index)).toEqual({ view: 'catalogs', id: null });
    expect(legacyAnchorTarget('something-else', index)).toBeNull();
    expect(legacyAnchorTarget('', index)).toBeNull();
  });

  it('every cross-reference the old page rendered resolves to a portal location', () => {
    const refIndex = buildReferenceIndex(summary);
    const refs = [
      { kind: 'event', name: 'purchase' },
      { kind: 'event', id: 'e3' },
      { kind: 'property', id: 'p2' },
      { kind: 'property', name: 'total price', scope: 'event' },
      { kind: 'catalog', id: 'c1' },
      { kind: 'consent', id: 'k1' },
    ] as const;
    for (const ref of refs) {
      const resolved = resolveReference(ref, 'shared', refIndex);
      expect(resolved, JSON.stringify(ref)).not.toBeNull();
      const target = targetForAnchorHref(resolved!.href, index);
      expect(target?.id, JSON.stringify(ref)).toBeTruthy();
    }
  });

  it('decodes a percent-encoded hash and keeps a malformed one as text', () => {
    expect(resolveHash('#event-cart-update', index, [])).toEqual({ kind: 'target', target: { view: 'events', id: 'cart update' } });
    expect(resolveHash('#property-total%2Dprice', index, [])).toEqual({ kind: 'target', target: { view: 'properties', id: 'total-price' } });
    expect(resolveHash('#event-%E0%A4%A', index, [])).toEqual({ kind: 'target', target: { view: 'events', id: null } });
    expect(resolveHash('', index, [])).toEqual({ kind: 'none' });
  });
});

describe('comment deep links land on their target', () => {
  const target = (entityType: CommentLinkTarget['entityType'], entityId: string): CommentLinkTarget => ({ entityType, entityId, threadId: 'root', commentId: 'reply' });
  const rows = (t: CommentLinkTarget, internal = false) => [
    { id: 'root', parent_id: null, entity_type: t.entityType, entity_id: t.entityId, internal_only: internal },
    { id: 'reply', parent_id: 'root', entity_type: t.entityType, entity_id: t.entityId },
  ];

  it.each([
    [target('event', 'e2'), { view: 'events', id: 'cart update' }],
    [target('property', 'p2'), { view: 'properties', id: 'loyalty_points-2' }],
    [target('property_definition', 'd3'), { view: 'properties', id: 'total-price' }],
    [target('use_case', 'u1'), { view: 'use-cases', id: 'UC-01' }],
    [target('requirement', 'q1'), { view: 'use-cases', id: 'UC-01' }],
    [target('identity_rule', 'r1'), { view: 'identity', id: 'r1' }],
    [target('catalog', 'c1'), { view: 'catalogs', id: 'products-de' }],
    [target('finding', 'f1'), { view: 'qa', id: null }],
    [target('qa_report', 'qa1'), { view: 'qa', id: null }],
  ])('%o', (t, expected) => {
    expect(commentTargetView(t, index)).toEqual(expected);
    const hash = commentFragment(t);
    expect(resolveHash(hash, index, rows(t))).toEqual({ kind: 'comment', target: { ...expected, hash }, link: t });
  });

  it('a missing, internal-only or removed target opens nothing; a malformed link is reported', () => {
    const t = target('event', 'e2');
    expect(resolveHash(commentFragment(t), index, [])).toEqual({ kind: 'comment-unavailable' });
    expect(resolveHash(commentFragment(t), index, rows(t, true))).toEqual({ kind: 'comment-unavailable' });
    const gone = target('event', 'deleted');
    expect(resolveHash(commentFragment(gone), index, rows(gone))).toEqual({ kind: 'comment-unavailable' });
    expect(resolveHash('#comment=v1&type=event&entity=e2&thread=root&target=%ZZ', index, [])).toEqual({ kind: 'comment-invalid' });
  });
});

describe('finding anchors filter the QA table', () => {
  const comparisons = ['definition_vs_observations', 'definition_vs_mapping'];
  it('maps the table, a comparison, a comparison and event, the project bucket and one finding', () => {
    expect(findingNavigationForAnchor('findings', comparisons, index.eventIdByAnchor, 1)).toEqual({ revision: 1 });
    expect(findingNavigationForAnchor('findings-definition_vs_mapping', comparisons, index.eventIdByAnchor, 2)).toEqual({ revision: 2, comparison: 'definition_vs_mapping' });
    expect(findingNavigationForAnchor('findings-definition_vs_observations-event-purchase', comparisons, index.eventIdByAnchor, 3)).toEqual({ revision: 3, comparison: 'definition_vs_observations', eventId: 'e1' });
    expect(findingNavigationForAnchor('findings-definition_vs_observations-project', comparisons, index.eventIdByAnchor, 4)).toEqual({ revision: 4, comparison: 'definition_vs_observations', eventId: PROJECT_FINDINGS });
    expect(findingNavigationForAnchor('current-finding-f9', comparisons, index.eventIdByAnchor, 5)).toEqual({ revision: 5, findingId: 'f9' });
    expect(findingNavigationForAnchor('finding-f9', comparisons, index.eventIdByAnchor, 6)).toBeNull();
  });
});

describe('sameTarget', () => {
  it('compares view and item, not the hash', () => {
    expect(sameTarget({ view: 'qa', id: null, hash: '#findings' }, 'qa', null)).toBe(true);
    expect(sameTarget({ view: 'events', id: 'purchase' }, 'events', null)).toBe(false);
  });
});

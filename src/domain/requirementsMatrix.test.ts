import { describe, expect, it } from 'vitest';
import {
  deriveTargetParts,
  extractQuotedNames,
  filterMatrixRows,
  formatTargetLabel,
  groupMatrixRows,
  type MatrixRowLike,
} from './requirementsMatrix';

const row = (over: Partial<MatrixRowLike>): MatrixRowLike => ({
  key: 'k',
  target_kind: 'event_property',
  group_label: 'purchase',
  leaf_label: 'total_price',
  is_gap: false,
  gap_note: null,
  cells: { a: 'R' },
  ...over,
});

const none = { eventName: null, variantName: null, propertyName: null, catalogFieldName: null, consentName: null };

describe('requirementsMatrix helpers', () => {
  it('extracts the template name from a gap note', () => {
    expect(extractQuotedNames('No event named "wishlist_add" in this project.')).toEqual(['wishlist_add']);
    expect(extractQuotedNames('target removed: wishlist_add')).toEqual(['wishlist_add']);
    expect(extractQuotedNames(null)).toEqual([]);
  });

  it('never uses the note as the label of a gap row', () => {
    const parts = deriveTargetParts({ target_kind: 'event', note: 'No event named "wishlist_add" in this project.', ...none });
    expect(parts).toEqual({ group_label: 'wishlist_add', leaf_label: '(event)' });
    expect(formatTargetLabel({ target_kind: 'event', ...parts })).toBe('wishlist_add');
  });

  it('keeps a resolved event and takes the missing property from the note', () => {
    const parts = deriveTargetParts({
      target_kind: 'event_property',
      note: 'No property named "coupon" is mapped',
      ...none,
      eventName: 'purchase',
    });
    expect(parts).toEqual({ group_label: 'purchase', leaf_label: 'coupon' });
  });

  it('falls back to (unresolved) with no note', () => {
    expect(deriveTargetParts({ target_kind: 'consent', note: null, ...none }).leaf_label).toBe('(unresolved)');
  });

  it('formats labels per kind', () => {
    expect(formatTargetLabel(row({}))).toBe('purchase.total_price');
    expect(
      formatTargetLabel(row({ target_kind: 'customer_property', group_label: 'Customer properties', leaf_label: 'email' }))
    ).toBe('email');
  });

  it('groups event and event_property rows under one event, event row first', () => {
    const groups = groupMatrixRows([
      row({ key: '1', leaf_label: 'b' }),
      row({ key: '2', target_kind: 'event', leaf_label: '(event)' }),
      row({ key: '3', target_kind: 'variant_property', group_label: 'purchase[ok]', leaf_label: 'x' }),
      row({ key: '4', target_kind: 'customer_property', group_label: 'Customer properties', leaf_label: 'email' }),
    ]);
    expect(groups.map((g) => g.label)).toEqual(['Customer properties', 'purchase', 'purchase[ok]']);
    expect(groups[1]!.rows.map((r) => r.key)).toEqual(['2', '1']);
  });

  it('filters by use case and gaps only', () => {
    const rows = [
      row({ key: '1', cells: { a: 'R', b: null } }),
      row({ key: '2', cells: { a: null, b: 'O' }, is_gap: true }),
    ];
    expect(filterMatrixRows(rows, { useCaseIds: [], gapsOnly: false }).length).toBe(2);
    expect(filterMatrixRows(rows, { useCaseIds: ['b'], gapsOnly: false }).map((r) => r.key)).toEqual(['2']);
    expect(filterMatrixRows(rows, { useCaseIds: null, gapsOnly: true }).map((r) => r.key)).toEqual(['2']);
  });
});

describe('real DAL gap notes (T-4-12 fix round)', () => {
  const noIds = { eventName: null, variantName: null, propertyName: null, catalogFieldName: null, consentName: null };

  it('groups a missing event property under the event named in the note', () => {
    const parts = deriveTargetParts({
      target_kind: 'event_property',
      note: 'No property named "coupon" is mapped (field_map) or linked to event "purchase".',
      ...noIds,
    });
    expect(parts).toEqual({ group_label: 'purchase', leaf_label: 'coupon' });
    expect(formatTargetLabel({ target_kind: 'event_property', ...parts })).toBe('purchase.coupon');
  });

  it('reads the event from a missing-event note', () => {
    const parts = deriveTargetParts({ target_kind: 'event', note: 'No event named "wishlist_add" in this project.', ...noIds });
    expect(parts.group_label).toBe('wishlist_add');
  });

  it('reads the event from variant notes and ignores the discriminator property', () => {
    expect(
      deriveTargetParts({
        target_kind: 'variant',
        note: 'No standard event mapping resolves a variant for "cart_update", and no condition was given to match one directly.',
        ...noIds,
      }).group_label
    ).toBe('cart_update');
    expect(
      deriveTargetParts({
        target_kind: 'variant',
        note: 'No variant of "cart_update" has exactly the condition action=add (and no other condition).',
        ...noIds,
      }).group_label
    ).toBe('cart_update');
    const cond = deriveTargetParts({
      target_kind: 'variant_property',
      note: 'No property named "action" to match the variant condition.',
      ...noIds,
    });
    expect(cond).toEqual({ group_label: '(unresolved event)', leaf_label: '(unresolved)' });
  });

  it('labels catalog attribute and consent rows by their leaf only', () => {
    expect(formatTargetLabel({ target_kind: 'catalog_attribute', group_label: 'Catalog attributes', leaf_label: 'image' })).toBe('image');
    expect(formatTargetLabel({ target_kind: 'consent', group_label: 'Consent', leaf_label: 'newsletter' })).toBe('newsletter');
  });
});

import { matrixCellBadge } from './requirementsMatrix';
describe('matrixCellBadge (T-4-27)', () => {
  it('maps R, O and everything else', () => {
    expect(matrixCellBadge('R')).toMatchObject({ kind: 'required', text: 'R' });
    expect(matrixCellBadge('O')).toMatchObject({ kind: 'optional', text: 'O' });
    expect(matrixCellBadge(null)).toMatchObject({ kind: 'none', text: '·' });
    expect(matrixCellBadge('x')).toMatchObject({ kind: 'none' });
  });
});

import { describe, expect, it } from 'vitest';
import { findingEntity } from './findingEntity';
import { buildReferenceIndex } from './references';

const index = buildReferenceIndex({
  events: [{ id: 'e1', name: 'purchase', variants: [{ id: 'v1', name: 'mobile' }] }],
  properties: [{ property_id: 'c1', name: 'email' }],
});
const sections = { catalogs: 'catalogs', consents: 'consents' };
const base = { kind: 'x', property_id: null, property: null, variant_id: null, variant: null };

describe('findingEntity (T-4-25)', () => {
  it('property and variant link to their anchors', () => {
    expect(findingEntity({ ...base, property_id: 'c1', property: 'email' }, index, sections)).toEqual({ type: 'Property', label: 'email', href: '#property-email' });
    expect(findingEntity({ ...base, variant_id: 'v1', variant: 'mobile' }, index, sections)).toMatchObject({ type: 'Variant', href: '#variants-event-purchase' });
  });
  it('catalog and consent findings link to their section; others have no entity', () => {
    expect(findingEntity({ ...base, kind: 'catalog_lookup_key' }, index, sections)).toMatchObject({ type: 'Catalog', href: '#catalogs' });
    expect(findingEntity({ ...base, kind: 'consent_unmapped' }, index, sections)).toMatchObject({ type: 'Consent', href: '#consents' });
    expect(findingEntity(base, index, sections)).toEqual({ type: null, label: null, href: null });
  });
});

describe('findingEntity consent and catalog payloads (T-4-25)', () => {
  const idx = buildReferenceIndex({
    events: [], properties: [],
    consent_categories: [{ id: 'n1', name: 'whatsapp_updates', standard_key: 'whatsapp' }],
  });
  it('links a rename_mismatch to its consent row by category name or standard key', () => {
    const f = { kind: 'rename_mismatch', property_id: null, property: null, variant_id: null, variant: null };
    expect(findingEntity({ ...f, expected: { category_name: 'whatsapp_updates' } }, idx, sections)).toMatchObject({ type: 'Consent', href: '#consent-whatsapp_updates' });
    expect(findingEntity({ ...f, expected: { standard_key: 'whatsapp' } }, idx, sections)).toMatchObject({ type: 'Consent', href: '#consent-whatsapp_updates' });
  });
  it('unmapped_catalog links to the Catalogs section', () => {
    expect(findingEntity({ ...base, kind: 'unmapped_catalog' }, idx, sections)).toMatchObject({ type: 'Catalog', href: '#catalogs' });
  });
});

/**
 * The entity a project-level ("Not tied to an event") finding concerns, for the shared view (T-4-25).
 * A finding carries a property or variant when it has one; a catalog or consent finding has neither,
 * so it is recognised from its kind prefix and links to that section. Pure.
 */
import { resolveReference, type ReferenceIndex } from './references';

export interface FindingEntityInput {
  kind: string;
  property_id: string | null;
  property: string | null;
  variant_id: string | null;
  variant: string | null;
}

export interface FindingEntity {
  type: 'Property' | 'Variant' | 'Catalog' | 'Consent' | null;
  label: string | null;
  href: string | null;
}

export function findingEntity(
  f: FindingEntityInput,
  index: ReferenceIndex,
  sections: { catalogs: string; consents: string }
): FindingEntity {
  if (f.property_id || f.property) {
    const t = f.property_id ? resolveReference({ kind: 'property', id: f.property_id }, 'shared', index) : null;
    return { type: 'Property', label: f.property ?? index.propertyNameById.get(f.property_id ?? '') ?? null, href: t?.href ?? null };
  }
  if (f.variant_id || f.variant) {
    const t = f.variant_id ? resolveReference({ kind: 'variant', id: f.variant_id }, 'shared', index) : null;
    return { type: 'Variant', label: f.variant ?? null, href: t?.href ?? null };
  }
  if (f.kind.startsWith('catalog')) return { type: 'Catalog', label: null, href: `#${sections.catalogs}` };
  if (f.kind.startsWith('consent')) return { type: 'Consent', label: null, href: `#${sections.consents}` };
  return { type: null, label: null, href: null };
}

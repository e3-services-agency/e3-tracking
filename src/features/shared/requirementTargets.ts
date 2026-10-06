/**
 * Use case requirement targets on the shared view (T-4-25): the small type label and the clickable
 * parts of a requirement's target. Pure; relative imports only (D-20).
 */
import type { RequirementTargetKind } from '../../domain/enums';
import { resolveReference, type Reference, type ReferenceIndex } from './references';

export interface RequirementTargetInput {
  target_label: string;
  target_kind?: string;
  event_id?: string | null;
  property_id?: string | null;
  variant_id?: string | null;
  catalog_id?: string | null;
  consent_category_id?: string | null;
}

/** Sidebar icon key (`NAV_ICONS`) per label family. */
export type TargetIconKey = 'events' | 'properties' | 'catalogs' | 'consentCategories';

export const REQUIREMENT_TARGET_LABELS: Record<RequirementTargetKind, { label: string; icon: TargetIconKey }> = {
  event: { label: 'Event', icon: 'events' },
  variant: { label: 'Variant', icon: 'events' },
  event_property: { label: 'Property', icon: 'properties' },
  variant_property: { label: 'Property', icon: 'properties' },
  customer_property: { label: 'Customer property', icon: 'properties' },
  catalog_attribute: { label: 'Catalog attribute', icon: 'catalogs' },
  consent: { label: 'Consent', icon: 'consentCategories' },
};

export interface TargetPart {
  text: string;
  /** `#anchor` when the part resolves, else `null` (plain text). */
  href: string | null;
  anchor: string | null;
}

export interface RequirementTargetView {
  typeLabel: string | null;
  icon: TargetIconKey | null;
  parts: TargetPart[];
}

/** The type label, icon and linked parts of a requirement target. Compound targets
 * (event.property, variant.property) give two parts, joined by `.` in the page. */
export function requirementTargetView(r: RequirementTargetInput, index: ReferenceIndex): RequirementTargetView {
  const info = r.target_kind ? (REQUIREMENT_TARGET_LABELS as Record<string, { label: string; icon: TargetIconKey } | undefined>)[r.target_kind] : undefined;
  const part = (text: string, ref: Reference | null): TargetPart => {
    const t = ref ? resolveReference(ref, 'shared', index) : null;
    return { text, href: t?.href ?? null, anchor: t && t.mode === 'shared' ? t.anchor : null };
  };
  const whole = (ref: Reference | null): TargetPart[] => [part(r.target_label, ref)];
  let parts: TargetPart[];
  switch (r.target_kind) {
    case 'event':
      parts = whole(r.event_id ? { kind: 'event', id: r.event_id } : null);
      break;
    case 'variant':
      parts = whole({ kind: 'variant', id: r.variant_id });
      break;
    case 'customer_property':
      parts = whole(r.property_id ? { kind: 'property', id: r.property_id } : null);
      break;
    case 'catalog_attribute':
      parts = whole({ kind: 'catalog', id: r.catalog_id });
      break;
    case 'consent':
      parts = whole({ kind: 'consent', id: r.consent_category_id });
      break;
    case 'event_property':
    case 'variant_property': {
      const head = r.target_kind === 'event_property' ? r.event_id : r.variant_id;
      const headName = head ? (r.target_kind === 'event_property' ? index.eventNameById : index.variantNameById).get(head) : undefined;
      const propName = r.property_id ? index.propertyNameById.get(r.property_id) : undefined;
      if (!head || !r.property_id || !headName || !propName) {
        parts = whole(null);
        break;
      }
      parts = [
        part(headName, r.target_kind === 'event_property' ? { kind: 'event', id: head } : { kind: 'variant', id: head }),
        part(propName, { kind: 'property', id: r.property_id }),
      ];
      break;
    }
    default:
      parts = whole(null);
  }
  return { typeLabel: info?.label ?? null, icon: info?.icon ?? null, parts };
}

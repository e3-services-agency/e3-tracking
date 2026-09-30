/**
 * Property categories (D-64, T-4-20): the one definition module for `PROPERTY_CATEGORIES`, the
 * reserved system customer properties with their recommended formats, and the pure
 * `classifyProperty`. No server or database imports (domain-model skill).
 *
 * Sources (see `.claude/team/samples/br-docs/`): the SDK default event properties (`os`, `browser`,
 * `device`, `location`) are named in `data-and-assets/data-structure/custom-events.md`; `email`,
 * `first_name`, `last_name` in `.../customers/customers.md`; `email`, `phone` (E.164 with plus),
 * `language`, `first_name`, `last_name` in `reference/bloomreach-identity-reference.md`. The docs do
 * not list `country` or `timezone` as reserved; they are here because D-64 names them.
 */
import { SDK_DEFAULT_PROPERTIES } from './bloomreach';
import type { PropertyDataFormat, PropertyKind } from './enums';

export const PROPERTY_CATEGORIES = ['system_customer', 'customer', 'sdk_default', 'event'] as const;
export type PropertyCategory = (typeof PROPERTY_CATEGORIES)[number];

export const PROPERTY_CATEGORY_LABELS: Record<PropertyCategory, string> = {
  system_customer: 'System customer',
  customer: 'Customer',
  sdk_default: 'SDK default',
  event: 'Event',
};

/** Sub-group labels for the `event` category (D-63 kinds). */
export const PROPERTY_KIND_LABELS: Record<PropertyKind, string> = {
  event: 'Event',
  item: 'Item',
  state_list: 'State list',
  context: 'Context',
};

export interface SystemCustomerProperty {
  name: string;
  /** Recommended `data_formats`, attached as a hint when a property of this name has none. */
  formats: readonly PropertyDataFormat[];
  /** Plain-words recommendation for docs and the property editor. */
  recommendation: string;
}

export const SYSTEM_CUSTOMER_PROPERTIES: ReadonlyArray<SystemCustomerProperty> = [
  { name: 'email', formats: ['email'], recommendation: 'A valid email address.' },
  { name: 'phone', formats: ['e164_phone'], recommendation: 'E.164: a plus sign, then digits only (+421900123456).' },
  { name: 'first_name', formats: ['title_case'], recommendation: 'Title Case (recommendation only, never a finding).' },
  { name: 'last_name', formats: ['title_case'], recommendation: 'Title Case (recommendation only, never a finding).' },
  { name: 'country', formats: ['country_code'], recommendation: 'ISO 3166-1 alpha-2, upper case (SK).' },
  { name: 'language', formats: ['language_tag'], recommendation: 'ISO 639-1, lower case; a BCP 47 region is allowed (en, pt-BR).' },
  { name: 'timezone', formats: ['iana_timezone'], recommendation: 'IANA time zone name (Europe/Bratislava).' },
];

export function getSystemCustomerProperty(name: string): SystemCustomerProperty | undefined {
  return SYSTEM_CUSTOMER_PROPERTIES.find((p) => p.name === name);
}

export function isPropertyCategory(value: unknown): value is PropertyCategory {
  return typeof value === 'string' && (PROPERTY_CATEGORIES as readonly string[]).includes(value);
}

export interface ClassifiablePropertyInput {
  scope: string;
  name: string;
  /** The stored override (`properties.category_override`); wins when it is a valid category. */
  category_override?: string | null;
}

/** Derived category: override first, else customer scope + reserved name = system_customer, other
 * customer = customer, event scope + SDK default name = sdk_default, else event. */
export function classifyProperty(property: ClassifiablePropertyInput): PropertyCategory {
  if (isPropertyCategory(property.category_override)) return property.category_override;
  if (property.scope === 'customer') {
    return getSystemCustomerProperty(property.name) ? 'system_customer' : 'customer';
  }
  if (SDK_DEFAULT_PROPERTIES.includes(property.name)) return 'sdk_default';
  return 'event';
}

/** Recommended formats for a property that has none: only a system customer property gets a hint,
 * and only when its effective category is still `system_customer`. */
export function recommendedFormatsFor(property: ClassifiablePropertyInput): readonly PropertyDataFormat[] {
  if (classifyProperty(property) !== 'system_customer') return [];
  return getSystemCustomerProperty(property.name)?.formats ?? [];
}

export interface PropertyGroupItem {
  category: PropertyCategory;
  /** D-63 kind; only used to sub-group the `event` category. */
  kind?: PropertyKind | null;
  name: string;
}

export interface PropertyKindSubgroup<T> {
  kind: PropertyKind;
  label: string;
  items: T[];
}

export interface PropertyGroup<T> {
  category: PropertyCategory;
  label: string;
  /** Every item of the category, sorted by name. */
  items: T[];
  /** Only for `event`: the items split by D-63 kind, in `PROPERTY_KINDS` order, empty kinds dropped. */
  subgroups: PropertyKindSubgroup<T>[];
}

/** DOM id of a category group / an event kind subgroup (shared view, HTML export). */
export function propertyGroupId(category: PropertyCategory): string {
  return `properties-${category}`;
}
export function propertyKindGroupId(kind: PropertyKind): string {
  return `properties-event-${kind}`;
}

/**
 * Groups properties for every read surface (shared view, HTML export, Markdown): categories in
 * `PROPERTY_CATEGORIES` order, empty ones dropped, items sorted by name; the `event` category also
 * carries kind subgroups (event, item, state list, context). Pure.
 */
export function groupPropertiesByCategory<T extends PropertyGroupItem>(items: readonly T[]): PropertyGroup<T>[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  const groups: PropertyGroup<T>[] = [];
  for (const category of PROPERTY_CATEGORIES) {
    const inCategory = items.filter((i) => i.category === category).sort(byName);
    if (inCategory.length === 0) continue;
    const subgroups: PropertyKindSubgroup<T>[] = [];
    if (category === 'event') {
      for (const kind of Object.keys(PROPERTY_KIND_LABELS) as PropertyKind[]) {
        const inKind = inCategory.filter((i) => (i.kind ?? 'event') === kind);
        if (inKind.length > 0) subgroups.push({ kind, label: PROPERTY_KIND_LABELS[kind], items: inKind });
      }
    }
    groups.push({ category, label: PROPERTY_CATEGORY_LABELS[category], items: inCategory, subgroups });
  }
  return groups;
}

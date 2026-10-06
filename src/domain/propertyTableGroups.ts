/** T-4-27: partitions the (already filtered and sorted) property rows into category groups. Pure. */
import { PROPERTY_CATEGORIES, PROPERTY_CATEGORY_LABELS, type PropertyCategory } from './propertyCategory';

export interface PropertyRowGroup<T> {
  category: PropertyCategory;
  label: string;
  rows: T[];
}

/** Groups in category order (system customer, customer, SDK default, event); empty groups are dropped; row order inside a group is the input order, so sorting applies within groups. */
export function groupRowsByCategory<T>(rows: readonly T[], classify: (row: T) => PropertyCategory): PropertyRowGroup<T>[] {
  return PROPERTY_CATEGORIES.map((category) => ({
    category,
    label: PROPERTY_CATEGORY_LABELS[category],
    rows: rows.filter((r) => classify(r) === category),
  })).filter((g) => g.rows.length > 0);
}

export function toggleCollapsed(collapsed: ReadonlySet<PropertyCategory>, category: PropertyCategory): Set<PropertyCategory> {
  const next = new Set(collapsed);
  if (next.has(category)) next.delete(category);
  else next.add(category);
  return next;
}

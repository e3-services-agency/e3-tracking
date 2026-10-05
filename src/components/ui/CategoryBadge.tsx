/**
 * Property category badge (T-4-22, D-64): `system_customer` and `sdk_default` carry the Bloomreach
 * accent (`--brand-bloomreach`, defined in `src/index.css`, same as `ClassBadge`); `customer` and
 * `event` stay neutral.
 */
import React from 'react';
import { PROPERTY_CATEGORY_LABELS, type PropertyCategory } from '@/src/domain/propertyCategory';

export function isBloomreachCategory(category: PropertyCategory): boolean {
  return category === 'system_customer' || category === 'sdk_default';
}

export function CategoryBadge({ category, className = '' }: { category: PropertyCategory; className?: string }) {
  return (
    <span
      data-testid="category-badge"
      className={`inline-block rounded border px-1.5 py-0.5 text-xs font-medium ${
        isBloomreachCategory(category)
          ? 'border-transparent bg-[var(--brand-bloomreach)] text-[var(--brand-bloomreach-text)]'
          : 'border-gray-200 bg-gray-50 text-gray-600'
      } ${className}`}
    >
      {PROPERTY_CATEGORY_LABELS[category]}
    </span>
  );
}

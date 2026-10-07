/**
 * One icon per entity kind (T-4-31), from `ENTITY_ICONS` in `navIcons.ts`, used identically on the
 * internal pages and the shared view: 14 px inline in text, 16 px in headers. Also accepts a
 * requirement target kind (`event_property`, `catalog_attribute`, ...).
 */
import React from 'react';
import { ENTITY_ICONS, type EntityKind } from '@/src/components/layout/navIcons';

export type EntityIconSize = 'inline' | 'header';
const PX: Record<EntityIconSize, number> = { inline: 14, header: 16 };

export function EntityIcon({ kind, size = 'inline', className = '' }: { kind: EntityKind; size?: EntityIconSize; className?: string }) {
  const Icon = ENTITY_ICONS[kind];
  return <Icon size={PX[size]} className={`shrink-0 text-gray-500 ${className}`} aria-hidden="true" data-entity-icon={kind} />;
}

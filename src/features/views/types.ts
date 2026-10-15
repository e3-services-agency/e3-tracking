/**
 * Row shapes and slots of the shared read-only views (D-88, T-5-40). A view component only knows
 * these rows: the client portal builds them from the public `TrackingDocument`
 * (`adapters/document.ts`), the internal pages from their own REST rows (`adapters/internal.ts`).
 * No view fetches, and no view holds an editor.
 */
import type React from 'react';
import type { PropertyCategory } from '@/src/domain/propertyCategory';
import type { IdentifierSetBy } from '@/src/domain/identity/identifiers';

/** What a page plugs into a view. Every slot is optional. */
export interface ViewSlots<R> {
  rows: readonly R[];
  /** Secondary actions, shown on row hover or focus (`.row-actions`, index.css). */
  rowActions?: (row: R) => React.ReactNode;
  /** Opens the row: the internal editor Sheet, or a detail view in the portal. */
  onOpen?: (row: R) => void;
  /** Open comment threads on the row; a count above zero is always visible. */
  commentCount?: (row: R) => number;
  /** `rowActions` carry their own comment control (e.g. `TargetCollaboration`): the always-visible
   * count then steps aside on hover so the count does not show twice. */
  commentsInActions?: boolean;
  /** Portal mode: full text, no planning-only columns, no reorder controls. */
  readOnly?: boolean;
  /** Message (and optional action) when there are no rows at all. */
  empty?: { message: string; actionLabel?: string; onAction?: () => void };
  /** Page-specific controls appended to the search and filter bar. */
  toolbarExtra?: React.ReactNode;
}

export interface ViewSource {
  id: string;
  name?: string | null;
  system: string;
  method: string | null;
  color?: string | null;
}

export interface EventVariantRow {
  id: string;
  name: string;
  description: string | null;
}

export interface EventViewRow {
  id: string;
  name: string;
  business_name: string | null;
  description: string | null;
  class: string;
  sources: ViewSource[];
  status: string;
  /** `n/a` for sdk and platform events. */
  certified: 'yes' | 'no' | 'n/a';
  certified_reasons: string[];
  /** `inherited` = the project default applies (shown muted). */
  expiration: { label: string; inherited: boolean };
  property_count: number;
  variants: EventVariantRow[];
}

export interface PropertyViewRow {
  id: string;
  name: string;
  scope: string;
  description: string | null;
  category: PropertyCategory;
  category_set_by_hand: boolean;
  data_type: string;
  kind: string | null;
  enum_count: number;
  priority: string | null;
  status: string | null;
  definition_count: number;
  used_by_count: number;
}

export interface UseCaseViewRow {
  id: string;
  code: string | null;
  name: string;
  type: string | null;
  description: string | null;
  priority: string | null;
  status: string | null;
  owner: string | null;
  /** `null` when the source row does not carry its requirements (internal list). */
  requirement_count: number | null;
}

export interface IdentityRuleViewRow {
  id: string;
  name: string;
  identifier_name: string;
  /** How many rules (acts) set the same identifier, this one included. */
  identifier_act_count: number;
  identity_type: string;
  sdk_call: string | null;
  trigger_event: string | null;
  set_by?: IdentifierSetBy;
  binds: string[];
  carried_by: { id: string; name: string }[];
  status: string | null;
}

export interface CatalogViewRow {
  id: string;
  name: string;
  description: string | null;
  kind: string | null;
  market_label: string;
  version: string | null;
  live: boolean;
  mapping_role: string | null;
  status: string | null;
  /** `null` when the source row does not carry its fields (internal list). */
  field_count: number | null;
}

export interface ConsentViewRow {
  id: string;
  name: string;
  standard_key: string | null;
  status: string | null;
}

export interface StandardEventViewRow {
  /** The standard event key; unique per row. */
  id: string;
  key: string;
  field_count: number;
  /** Fields mapped to a project property; `null` when not known. */
  mapped_field_count: number | null;
  event_name: string | null;
  variant_name: string | null;
}

/**
 * Shared diff vocabulary (D-04, D-22, T-1-08). `Difference` is the low-level, pure output of the
 * primitives in `primitives.ts`: one row per field-level or record-level change. Two consumers map
 * `Difference[]` to their own shape:
 *  - Import planners (`src/backend/services/*Import.service.ts`) map them to `DiffItem[]`, the
 *    proposed-write list shown by the Import page's preview table (PLAN "Import / export
 *    contracts").
 *  - The QA comparison engine (T-1-09) maps them to `Finding[]` (kinds/severities from
 *    `src/domain/enums.ts`).
 * This module has no DB or Express import (domain-model skill): it is pure and unit-testable on
 * its own.
 */

/** What kind of change a `Difference` describes, relative to the "before" (current) side. */
export type DifferenceKind = 'add' | 'change' | 'remove' | 'warning';

export interface Difference {
  kind: DifferenceKind;
  /** Logical entity type this difference is about, e.g. `event`, `property`, `variant`. */
  entity_type: string;
  /** Human-readable key identifying the entity/record within its type, e.g. an event name. */
  key: string;
  /** Set for `change`/field-level differences; omitted for whole-record `add`/`remove`/`warning`. */
  field?: string;
  /** The "before"/current value (undefined for `add`, the whole current record for `remove`). */
  before?: unknown;
  /** The "after"/desired value (undefined for `remove`, the whole desired record for `add`). */
  after?: unknown;
  /** Human-readable summary, always present so a caller can render a `Difference` with no extra formatting. */
  message: string;
}

/** One field-level change inside a `DiffItem` (PLAN "Import / export contracts"). */
export interface DiffItemChange {
  field: string;
  before: unknown;
  after: unknown;
}

/**
 * A proposed write shown in an import preview table (PLAN: `DiffItem = {id, op, entity_type,
 * entity_key, changes, default_selected, note?}`). `apply` re-runs the planner and only executes
 * the steps whose `id` is in the caller's `selected_item_ids`.
 */
export interface DiffItem {
  id: string;
  op: 'create' | 'update' | 'delete' | 'unchanged' | 'conflict';
  entity_type: string;
  entity_key: string;
  changes: DiffItemChange[];
  default_selected: boolean;
  note?: string;
  /**
   * Set when this item is always applied regardless of the caller's `selected_item_ids` (D-35's
   * Data Manager snapshot steps, T-2-02 fix round WARNING 4): the UI must render its checkbox
   * checked and disabled rather than implying the user's toggle has any effect.
   */
  locked?: boolean;
}

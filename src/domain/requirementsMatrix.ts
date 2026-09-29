/**
 * Pure helpers for the requirements matrix page (T-4-12): derive the group/leaf of a target,
 * group rows by event / variant, filter by use case and gaps-only, and format a target label.
 * No server or database imports (domain-model skill); the backend service and the page share it.
 */

export type TargetGroupKind = 'customer' | 'event' | 'variant' | 'catalog' | 'consent';

const GROUP_KIND_BY_TARGET: Record<string, TargetGroupKind> = {
  customer_property: 'customer',
  event: 'event',
  event_property: 'event',
  variant: 'variant',
  variant_property: 'variant',
  catalog_attribute: 'catalog',
  consent: 'consent',
};

const GROUP_ORDER: TargetGroupKind[] = ['customer', 'event', 'variant', 'catalog', 'consent'];

export function groupKindOf(targetKind: string): TargetGroupKind {
  return GROUP_KIND_BY_TARGET[targetKind] ?? 'customer';
}

/** Every double-quoted name in a gap note, e.g. `No event named "wishlist_add" in ...` gives ['wishlist_add']. */
export function extractQuotedNames(note: string | null | undefined): string[] {
  if (!note) return [];
  const names: string[] = [];
  const re = /"([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(note)) !== null) names.push(m[1]!);
  const removed = note.match(/target removed: ([^|]+)/);
  if (names.length === 0 && removed) names.push(removed[1]!.trim());
  return names;
}

export interface TargetPartsInput {
  target_kind: string;
  /** The gap note, only when the requirement is a gap (used to recover the name written in the template). */
  note: string | null;
  eventName: string | null;
  variantName: string | null;
  propertyName: string | null;
  catalogFieldName: string | null;
  consentName: string | null;
}

export interface ParsedGapNote {
  /** Event (or variant's event) named by keyword: `No event named "X"`, `linked to event "X"`, `variant for "X"`, `variant of "X"`. */
  event: string | null;
  /** Target property named by keyword: `No property named "p" is mapped ...`. */
  property: string | null;
}

/**
 * Parses the reasons `use-case-template.dal.ts` writes for an unresolved template requirement by
 * keyword, never by position. `No property named "p" to match the variant condition` names the
 * discriminator, not the target, so it is ignored here.
 */
export function parseGapNote(note: string | null | undefined): ParsedGapNote {
  if (!note) return { event: null, property: null };
  const event = note.match(/(?:event named|to event|variant for|variant of) "([^"]+)"/);
  const conditionOnly = /to match the variant condition/.test(note);
  const property = conditionOnly ? null : note.match(/property named "([^"]+)"/);
  return { event: event?.[1] ?? null, property: property?.[1] ?? null };
}

/**
 * The group (event / variant / kind heading) and leaf name of a target. An unresolved part is
 * recovered from the gap note by keyword (`parseGapNote`), then, only when no keyword matched, by
 * the first quoted name; else "(unresolved)". The note itself is never the label.
 */
export function deriveTargetParts(input: TargetPartsInput): { group_label: string; leaf_label: string } {
  const quoted = extractQuotedNames(input.note);
  const parsed = parseGapNote(input.note);
  const keywordHit = parsed.event !== null || parsed.property !== null;
  const positional = keywordHit ? null : quoted[0] ?? null;
  const unresolved = '(unresolved)';
  const parentAndProperty = (parentName: string | null) => {
    const group = parentName ?? parsed.event ?? (parsed.property === null ? positional : null) ?? '(unresolved event)';
    const leaf = input.propertyName ?? parsed.property ?? (parentName !== null ? positional : null) ?? '(unresolved property)';
    return { group_label: group, leaf_label: leaf };
  };
  switch (input.target_kind) {
    case 'customer_property':
      return { group_label: 'Customer properties', leaf_label: input.propertyName ?? parsed.property ?? quoted[0] ?? unresolved };
    case 'event':
      return { group_label: input.eventName ?? parsed.event ?? quoted[0] ?? unresolved, leaf_label: '(event)' };
    case 'event_property':
      return parentAndProperty(input.eventName);
    case 'variant':
      return { group_label: input.variantName ?? parsed.event ?? quoted[0] ?? unresolved, leaf_label: '(variant)' };
    case 'variant_property':
      return parentAndProperty(input.variantName);
    case 'catalog_attribute':
      return { group_label: 'Catalog attributes', leaf_label: input.catalogFieldName ?? quoted[0] ?? unresolved };
    case 'consent':
      return { group_label: 'Consent', leaf_label: input.consentName ?? quoted[0] ?? unresolved };
    default:
      return { group_label: 'Other', leaf_label: quoted[0] ?? unresolved };
  }
}

export interface MatrixRowLike {
  key: string;
  target_kind: string;
  group_label: string;
  leaf_label: string;
  is_gap: boolean;
  gap_note: string | null;
  cells: Record<string, string | null>;
}

/** The target as written: `group.leaf`, or just the group for an event/variant itself. */
export function formatTargetLabel(row: Pick<MatrixRowLike, 'target_kind' | 'group_label' | 'leaf_label'>): string {
  if (row.target_kind === 'event' || row.target_kind === 'variant') return row.group_label;
  if (row.target_kind === 'customer_property' || row.target_kind === 'catalog_attribute' || row.target_kind === 'consent') {
    return row.leaf_label;
  }
  return `${row.group_label}.${row.leaf_label}`;
}

export interface MatrixGroup<R extends MatrixRowLike> {
  key: string;
  kind: TargetGroupKind;
  label: string;
  rows: R[];
}

/** Groups rows by event / variant / heading; groups ordered by kind then name, event/variant rows first inside a group. */
export function groupMatrixRows<R extends MatrixRowLike>(rows: R[]): MatrixGroup<R>[] {
  const groups = new Map<string, MatrixGroup<R>>();
  for (const row of rows) {
    const kind = groupKindOf(row.target_kind);
    const key = `${kind}:${row.group_label}`;
    let g = groups.get(key);
    if (!g) {
      g = { key, kind, label: row.group_label, rows: [] };
      groups.set(key, g);
    }
    g.rows.push(row);
  }
  const selfRank = (r: MatrixRowLike) => (r.target_kind === 'event' || r.target_kind === 'variant' ? 0 : 1);
  const out = Array.from(groups.values());
  for (const g of out) {
    g.rows.sort((a, b) => selfRank(a) - selfRank(b) || a.leaf_label.localeCompare(b.leaf_label));
  }
  return out.sort(
    (a, b) => GROUP_ORDER.indexOf(a.kind) - GROUP_ORDER.indexOf(b.kind) || a.label.localeCompare(b.label)
  );
}

export interface MatrixFilter {
  /** Selected use case ids; empty or null means every use case. */
  useCaseIds: string[] | null;
  gapsOnly: boolean;
}

/** Keeps rows that have a requirement from a selected use case (when any are selected) and, if `gapsOnly`, are gaps. */
export function filterMatrixRows<R extends MatrixRowLike>(rows: R[], filter: MatrixFilter): R[] {
  const selected = filter.useCaseIds && filter.useCaseIds.length > 0 ? filter.useCaseIds : null;
  return rows.filter((row) => {
    if (filter.gapsOnly && !row.is_gap) return false;
    if (selected && !selected.some((id) => row.cells[id])) return false;
    return true;
  });
}

/**
 * Standard event mapping presentation (T-4-19, item 3). Pure. One mapping's field map becomes a
 * mapped-first list plus the "6 of 9 fields mapped" count; used by the shared view, the event card
 * and the HTML export so all three read the same.
 */
export interface GroupedFieldMap {
  mapped: { field: string; property: string }[];
  unmapped: string[];
  total: number;
  /** "6 of 9 fields mapped" */
  summary: string;
}

export function groupFieldMap(fieldMap: Record<string, string | null | undefined>): GroupedFieldMap {
  const mapped: { field: string; property: string }[] = [];
  const unmapped: string[] = [];
  for (const [field, property] of Object.entries(fieldMap ?? {})) {
    if (property) mapped.push({ field, property });
    else unmapped.push(field);
  }
  const total = mapped.length + unmapped.length;
  const noun = total === 1 ? 'field' : 'fields';
  return { mapped, unmapped, total, summary: `${mapped.length} of ${total} ${noun} mapped` };
}

/** "Standard event -> event (variant)" heading text; a mapping on the whole event has no variant part. */
export function mappingHeading(standardEvent: string, eventName: string | null, variantName: string | null): string {
  const target = eventName ? `${eventName}${variantName ? ` (${variantName})` : ''}` : variantName ? `(${variantName})` : 'the event';
  return `${standardEvent} → ${target}`;
}

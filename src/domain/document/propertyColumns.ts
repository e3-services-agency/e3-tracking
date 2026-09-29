/**
 * Property table column sets per view (T-4-19, item 6). Pure.
 * Shared (client) view: Payload key, Type, Kind, Required, Description, Example. Everything else
 * that is present (role, name, formats, allowed values, PII, bundle, dataLayer path) folds into the
 * description cell as small secondary lines, so the table fits the card at 1440px with no scroller.
 * The internal card keeps every column.
 */
export interface PropertyColumnsInput {
  name: string;
  payload_key: string;
  data_type: string;
  data_formats: string[];
  role: string;
  allowed_values: { value: string }[] | null;
  pii: boolean;
  kind?: string;
  datalayer_path?: string | null;
  bundle?: string | null;
}

export const SHARED_PROPERTY_HEAD = ['Payload key', 'Type', 'Kind', 'Required', 'Description', 'Example'] as const;

/** Small secondary lines for the shared view's description cell; only what is present. */
export function secondaryPropertyLines(p: PropertyColumnsInput): string[] {
  const lines: string[] = [];
  if (p.name !== p.payload_key) lines.push(`Name: ${p.name}`);
  if (p.role !== 'normal') lines.push(`Role: ${p.role}`);
  if (p.data_formats.length > 0) lines.push(`Formats: ${p.data_formats.join(', ')}`);
  if (p.allowed_values && p.allowed_values.length > 0) lines.push(`Allowed values: ${p.allowed_values.map((v) => v.value).join(', ')}`);
  if (p.pii) lines.push('PII');
  if (p.bundle) lines.push(`Bundle: ${p.bundle}`);
  if (p.datalayer_path) lines.push(`dataLayer: ${p.datalayer_path}`);
  return lines;
}

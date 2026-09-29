/**
 * Payload key helpers (T-4-12): the payload key is the primary identifier of a property on an
 * event; the display name is secondary and only shown where it differs. Pure, no server imports.
 */
export function effectivePayloadKey(name: string, payloadKey: string | null | undefined): string {
  return payloadKey?.trim() || name;
}

/** True when at least one item's display name differs from its payload key (else the Name column is hidden). */
export function anyNameDiffersFromKey(items: { name: string; payload_key: string | null | undefined }[]): boolean {
  return items.some((i) => effectivePayloadKey(i.name, i.payload_key) !== i.name);
}

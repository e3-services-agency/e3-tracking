/**
 * Stable hash of a JSON-serializable payload (D-22): `import/<format>/preview` returns a
 * `payload_hash`; `apply` resends the same raw JSON and the hash, and the server 409s
 * `PAYLOAD_CHANGED` if a fresh preview of the resent JSON hashes differently. Object keys are
 * sorted recursively first so the hash depends only on content, never on key order.
 */
import { createHash } from 'node:crypto';

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

export function payloadHash(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(canonicalize(value))).digest('hex');
}

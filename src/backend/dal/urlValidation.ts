/**
 * D-59 fix round (WARNING 8): shared `http(s)`-only validation for `documentation_url` and
 * `internal_url` on `use_case_templates` and `use_cases` -- both fields are rendered as an `href`
 * in the HTML export and the React pages (and, from T-4-03, the public shared view), so a
 * `javascript:` (or any other non-http(s)) scheme must be rejected at write time rather than
 * merely escaped at render time. `undefined` (field not present in the patch) is left alone by the
 * caller before this is even invoked; `null`/`''` (clearing the field) is accepted and normalised
 * to `null`; a non-string value is a 400 the same way a bad scheme is.
 */
import { ValidationError } from '../errors';
import { isHttpUrl } from '../../domain/url';

/** Re-exported for `document.service.ts`'s `toEventCardTriggers` (T-4-03) and any other DAL-side
 * read-time check: the http(s) rule itself now lives in `src/domain/url.ts` (T-4-03 QA fix round)
 * so `src/pages/Events.tsx`'s client-side trigger URL field validates against the exact same rule
 * without importing a backend module. */
export { isHttpUrl };

/** Returns the trimmed value or `null`; throws `ValidationError` (400) on a non-string or a non-http(s) URL. */
export function normalizeHttpUrl(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string.`, field);
  }
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!isHttpUrl(trimmed)) {
    throw new ValidationError(`${field} must be an http:// or https:// URL.`, field);
  }
  return trimmed;
}

/**
 * D-59 fix round 2 (WARNING 1): the third field of the same "Internal" PATCH surface --
 * `internal_notes` is free text, not a URL, but a non-string value (`{"internal_notes": 123}`) must
 * still 400 rather than crash `?.trim()` with a 500. `null`/`undefined`/`''` clear the field.
 */
export function normalizeOptionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') {
    throw new ValidationError(`${field} must be a string.`, field);
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

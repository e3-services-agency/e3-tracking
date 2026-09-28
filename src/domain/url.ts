/**
 * Single source of truth for the `http(s)`-only URL rule (T-4-03 QA fix round): `documentation_url`/
 * `internal_url` (`src/backend/dal/urlValidation.ts`) and `triggers_json[].source` (D-50, the page a
 * trigger screenshot was captured on) all render as an `href` somewhere -- the event editor
 * (`src/pages/Events.tsx`), `EventCardView`, `SharedProject` and the HTML docs export -- so a
 * `javascript:` (or any other non-http(s)) scheme must be rejected the same way everywhere a value
 * is written, client-side or server-side. Pure, no server/DB import (domain-model skill), so both
 * `src/backend/dal/urlValidation.ts` and frontend pages import this one regex instead of each
 * keeping their own copy.
 */
const HTTP_URL_RE = /^https?:\/\//i;

/** Whether `value` (already expected to be a trimmed string) starts with `http://` or `https://`. */
export function isHttpUrl(value: string): boolean {
  return HTTP_URL_RE.test(value);
}

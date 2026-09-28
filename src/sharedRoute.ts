/**
 * Pure route-matching helper behind `App.tsx`'s `/tracking-plan/shared/:token` mount (D-48, D-50,
 * T-4-03), split into its own module (plain relative imports only, no `@/...` alias, matching
 * `components/layout/pushPath.ts`'s precedent) so it's unit-testable without pulling in `App.tsx`'s
 * whole component tree (`Layout`, `AuthProvider`, ... which do use the `@` alias `vitest.config.ts`
 * doesn't configure, D-20 plain-Node vitest, no jsdom).
 */

export const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null
    ? String(import.meta.env.BASE_URL).replace(/\/$/, '')
    : '';

/** `/tracking-plan/shared/:token`: public, unauthenticated, rendered before
 * `ProtectedRoute`/`AuthProvider` gets a chance to redirect to `/login`. `undefined` for every
 * other path.
 *
 * T-4-03 pre-QA fix: a malformed percent-escape in the token segment (e.g. `%ZZ`) used to make
 * `decodeURIComponent` throw a raw `URIError` straight out of this function and into
 * `AppContent`'s render body -- uncaught, it reached `ErrorBoundary` instead of the share flow's
 * own "This link is not valid" page. Falling back to the raw (still-encoded) segment instead of
 * throwing keeps this function total: `SharedProject` then re-encodes that raw string and sends it
 * to `GET /api/shared/:token`, which is guaranteed not to match a real token (the routes there
 * always compare against a `randomBytes(32).toString('base64url')` value, D-48), so the ordinary
 * unknown-token 404 path renders the right page -- no special-casing needed downstream. */
export function sharedTokenFromPath(pathname: string): string | undefined {
  const withoutBase = BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/' : pathname;
  const match = withoutBase.match(/^\/shared\/([^/]+)\/?$/);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return match[1];
  }
}

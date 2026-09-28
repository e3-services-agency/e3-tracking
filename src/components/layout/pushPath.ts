/**
 * Shared browser-history navigation helper (T-1-09; extracted from `Layout.tsx` in T-3-05's QA
 * fix so a flow outside the `Layout` component tree -- the restore-backup form -- can navigate to
 * a brand-new project's URL through the same `/p/<key>` path shape `Layout.tsx` itself uses,
 * instead of hand-rolling a second copy that could drift from it.
 *
 * `buildProjectPath` is the pure part (no `window`/`import.meta` access beyond reading `BASE`
 * once at module load): given a rest-of-path and an optional project key, it returns the full
 * path string. It is unit-testable in the plain-Node vitest environment this repo uses (D-20,
 * `vitest.config.ts` has no jsdom); `pushPath` itself touches `window.history`/`window.location`
 * and is exercised manually (qa-roundtrip), same as before this extraction.
 */

export const BASE =
  typeof import.meta !== 'undefined' && (import.meta.env?.BASE_URL != null)
    ? String(import.meta.env.BASE_URL).replace(/\/$/, '')
    : '';

/** `projectKeyForUrl` is the short project key segment (not UUID). Pass `null`/omit to drop `/p/...` from the path. */
export function buildProjectPath(nextPath: string, projectKeyForUrl?: string | null): string {
  const prefix = projectKeyForUrl ? `/p/${projectKeyForUrl}` : '';
  return `${BASE}${prefix}${nextPath.startsWith('/') ? nextPath : `/${nextPath}`}`;
}

/** Pushes `buildProjectPath(nextPath, projectKeyForUrl)` onto the browser history without a full navigation. */
export function pushPath(nextPath: string, projectKeyForUrl?: string | null): void {
  try {
    const full = buildProjectPath(nextPath, projectKeyForUrl);
    if (typeof window !== 'undefined' && window.location.pathname !== full) {
      window.history.pushState({}, '', full);
    }
  } catch {
    // ignore
  }
}

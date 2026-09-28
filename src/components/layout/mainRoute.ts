/**
 * Pure path -> shell-tab mapping, extracted from `Layout.tsx` (T-4-09) so it can be unit-tested
 * with a plain `.ts` test file: `vitest.config.ts` only collects `src/**\/*.test.ts` (no component
 * tests / jsdom yet, D-20 comment), and `Layout.tsx` itself pulls in `@/`-aliased React components
 * that vitest's standalone (non-Vite-app) config cannot resolve.
 */

/** Maps the path after optional `/p/:projectKey` to the main shell tab. `eventCardId` is set only
 * for `/events/:id/card` (T-2-09), read by `LayoutInner` to seed the store's `eventCardEventId`. */
export function mainRouteStateFromRestPath(restPath: string): { tab: string; eventCardId?: string } {
  const raw = (restPath.replace(/\/$/, '') || '/').trim() || '/';
  const cardMatch = raw.match(/^\/events\/([^/]+)\/card$/);
  if (cardMatch) return { tab: 'eventCard', eventCardId: cardMatch[1] };
  switch (raw) {
    case '/':
    case '/events':
      return { tab: 'events' };
    case '/properties':
      return { tab: 'properties' };
    case '/catalogs':
      return { tab: 'catalogs' };
    case '/identity-rules':
      return { tab: 'identityRules' };
    case '/consent-categories':
      return { tab: 'consentCategories' };
    case '/standard-events':
      return { tab: 'standardEvents' };
    case '/use-cases':
      return { tab: 'useCases' };
    case '/use-case-templates':
      return { tab: 'useCaseTemplates' };
    case '/requirements-matrix':
      return { tab: 'requirementsMatrix' };
    case '/sources':
      return { tab: 'sources' };
    case '/import':
      return { tab: 'import' };
    case '/qa-runs':
      return { tab: 'qaRuns' };
    case '/findings':
      return { tab: 'findings' };
    case '/history':
      return { tab: 'history' };
    case '/comments':
      return { tab: 'comments' };
    case '/clients':
      return { tab: 'clients' };
    case '/settings':
      return { tab: 'settings' };
    case '/documentation':
      return { tab: 'documentation' };
    case '/getting-started':
      return { tab: 'gettingStarted' };
    case '/help':
      return { tab: 'help' };
    default:
      return { tab: 'events' };
  }
}

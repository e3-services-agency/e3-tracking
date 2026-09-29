/**
 * T-4-09: the Help and Getting started pages are reachable through the same path -> tab mapping
 * every other sidebar page uses.
 */
import { describe, expect, it } from 'vitest';
import { helpPathForSlug, helpSlugFromPathname, mainRouteStateFromRestPath } from './mainRoute';

describe('mainRouteStateFromRestPath (T-4-09 Help/Getting started routes)', () => {
  it('maps /help to the help tab', () => {
    expect(mainRouteStateFromRestPath('/help')).toEqual({ tab: 'help' });
  });

  it('maps /getting-started to the gettingStarted tab', () => {
    expect(mainRouteStateFromRestPath('/getting-started')).toEqual({ tab: 'gettingStarted' });
  });

  it('still maps the root path to events (unrelated regression guard)', () => {
    expect(mainRouteStateFromRestPath('/')).toEqual({ tab: 'events' });
  });
});

describe('T-4-13 Help deep links and the retired Documentation route', () => {
  it('maps /help/<slug> to the help tab with the slug', () => {
    expect(mainRouteStateFromRestPath('/help/catalogs')).toEqual({ tab: 'help', helpSlug: 'catalogs' });
  });

  it('redirects the old /documentation route to the help tab', () => {
    expect(mainRouteStateFromRestPath('/documentation')).toEqual({ tab: 'help' });
  });

  it('reads the slug from a full pathname, with or without a project prefix', () => {
    expect(helpSlugFromPathname('/tracking-plan/p/acme/help/mcp')).toBe('mcp');
    expect(helpSlugFromPathname('/help')).toBeNull();
    expect(helpSlugFromPathname('/tracking-plan/help/%E0%A4%A')).toBeNull();
  });

  it('builds the pathname for a slug, keeping the prefix', () => {
    expect(helpPathForSlug('/tracking-plan/p/acme/help', 'mcp')).toBe('/tracking-plan/p/acme/help/mcp');
    expect(helpPathForSlug('/tracking-plan/p/acme/help/domain/', 'mcp')).toBe('/tracking-plan/p/acme/help/mcp');
    expect(helpPathForSlug('/p/acme/documentation', 'domain')).toBe('/p/acme/help/domain');
  });
});

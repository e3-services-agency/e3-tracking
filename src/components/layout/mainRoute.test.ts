/**
 * T-4-09: the Help and Getting started pages are reachable through the same path -> tab mapping
 * every other sidebar page uses.
 */
import { describe, expect, it } from 'vitest';
import { mainRouteStateFromRestPath } from './mainRoute';

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

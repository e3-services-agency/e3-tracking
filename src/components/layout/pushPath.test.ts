/**
 * `buildProjectPath` (T-3-05 QA fix): the pure path-construction half of `pushPath`, testable in
 * this repo's plain-Node vitest environment (D-20, no jsdom/`window`). `pushPath` itself (the
 * `window.history.pushState` call) is exercised manually as part of the restore-backup
 * qa-roundtrip flow: Clients page -> Restore backup -> Apply -> the browser URL changes to
 * `/p/<newKey>/events` before the page reloads, and `resolveInitialProject`'s "URL wins" rule then
 * selects the restored project on that reload.
 */
import { describe, it, expect } from 'vitest';
import { buildProjectPath, BASE } from './pushPath';

describe('buildProjectPath', () => {
  it('joins the base, the project key prefix and the rest path', () => {
    expect(buildProjectPath('/events', 'acme-eu')).toBe(`${BASE}/p/acme-eu/events`);
  });

  it('adds a leading slash to a rest path that is missing one', () => {
    expect(buildProjectPath('events', 'acme-eu')).toBe(`${BASE}/p/acme-eu/events`);
  });

  it('drops the /p/... prefix entirely when projectKeyForUrl is null', () => {
    expect(buildProjectPath('/clients', null)).toBe(`${BASE}/clients`);
  });

  it('drops the /p/... prefix entirely when projectKeyForUrl is omitted', () => {
    expect(buildProjectPath('/clients')).toBe(`${BASE}/clients`);
  });
});

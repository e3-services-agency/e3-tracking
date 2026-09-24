import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { parseExpirationSettings } from './expirationSettings';

const fixturePath = path.resolve(__dirname, '../../../.claude/team/samples/expiration-settings.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

describe('parseExpirationSettings on the fixture', () => {
  const model = parseExpirationSettings(fixture);

  it('parses all six events', () => {
    expect(model.events.map((e) => e.type).sort()).toEqual(
      ['consent', 'notification_state', 'page_visit', 'session_end', 'session_start', 'web_exit'].sort()
    );
  });

  it('parses an enabled duration (session_start: 3 months)', () => {
    const sessionStart = model.events.find((e) => e.type === 'session_start')!;
    expect(sessionStart.expiration).toEqual({ enabled: true, count: 3, units: 'months' });
  });

  it('parses a disabled event with no duration (consent)', () => {
    const consent = model.events.find((e) => e.type === 'consent')!;
    expect(consent.expiration).toEqual({ enabled: false, count: null, units: null });
  });

  it('parses other as disabled with no duration', () => {
    expect(model.other).toEqual({ enabled: false, count: null, units: null });
  });

  it('produces no warnings on the well-formed fixture', () => {
    expect(model.warnings).toEqual([]);
  });
});

describe('parseExpirationSettings malformed inputs', () => {
  it('returns a warning and empty model for a non-object root', () => {
    const model = parseExpirationSettings([1, 2, 3]);
    expect(model.warnings.length).toBeGreaterThan(0);
    expect(model.events).toEqual([]);
  });

  it('skips an events[] item missing "type" instead of throwing', () => {
    const model = parseExpirationSettings({ events: [{ expiration: { enabled: true, duration: { count: 1, units: 'days' } } }] });
    expect(model.events).toEqual([]);
    expect(model.warnings.some((w) => w.includes('type'))).toBe(true);
  });

  it('warns and drops an invalid units value instead of throwing', () => {
    const model = parseExpirationSettings({
      events: [{ type: 'page_visit', filter: [], expiration: { enabled: true, duration: { count: 5, units: 'fortnights' } } }],
    });
    const pageVisit = model.events.find((e) => e.type === 'page_visit')!;
    expect(pageVisit.expiration.units).toBeNull();
    expect(model.warnings.some((w) => w.includes('fortnights'))).toBe(true);
  });

  it('handles a missing "other" block with a warning, defaulting to disabled', () => {
    const model = parseExpirationSettings({ events: [] });
    expect(model.other).toEqual({ enabled: false, count: null, units: null });
    expect(model.warnings.length).toBeGreaterThan(0);
  });
});

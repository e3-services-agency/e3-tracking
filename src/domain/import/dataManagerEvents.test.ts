import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseDataManagerEvents } from './dataManagerEvents';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.join(__dirname, '..', '..', '..', '.claude', 'team', 'samples', 'data-manager-events.json');

function loadFixture(): unknown {
  return JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf-8'));
}

describe('parseDataManagerEvents', () => {
  it('parses the fixture: 61 events, the MentionMe group, the empty-properties event, no hard errors', () => {
    const model = parseDataManagerEvents(loadFixture());
    expect(model.events).toHaveLength(61);
    expect(model.default_forbidden).toBe(false);
    expect(model.default_private).toBe(false);
    expect(model.group_order).toEqual(['MentionMe']);

    const mentionMe = model.events.filter((e) => e.group === 'MentionMe');
    expect(mentionMe).toHaveLength(6);
    expect(mentionMe.map((e) => e.type).sort()).toEqual(
      [
        'registered_as_referee',
        'registered_as_referrer',
        'received_referee_reward',
        'received_referrer_reward',
        'submitted_nps_score',
        'received_reward_next_order',
      ].sort()
    );

    const nps = model.events.find((e) => e.type === 'submitted_nps_score');
    expect(nps).toMatchObject({ properties: [], group: 'MentionMe' });
    expect(model.warnings.some((w) => w.includes('submitted_nps_score') && w.includes('no properties'))).toBe(true);

    const purchase = model.events.find((e) => e.type === 'purchase');
    expect(purchase).toBeTruthy();
    expect(purchase!.properties.length).toBeGreaterThan(0);
    const totalPrice = purchase!.properties.find((p) => p.property === 'total_price');
    expect(totalPrice).toMatchObject({ type: 'number', source: 'user' });
  });

  it('reads per-event flags (source, used, forbidden, deleting, real_time_analytics)', () => {
    const model = parseDataManagerEvents(loadFixture());
    const purchase = model.events.find((e) => e.type === 'purchase')!;
    expect(purchase).toMatchObject({ source: 'data', used: true, forbidden: false, deleting: false, real_time_analytics: true });
  });

  it('assigns a monotonic dm_index across default_group then groups[] in file order', () => {
    const model = parseDataManagerEvents(loadFixture());
    const indices = model.events.map((e) => e.dm_index);
    expect(indices).toEqual([...indices].sort((a, b) => a - b));
    expect(new Set(indices).size).toBe(indices.length);
  });

  it('rejects a non-object payload', () => {
    const model = parseDataManagerEvents(null);
    expect(model.events).toEqual([]);
    expect(model.warnings.length).toBeGreaterThan(0);
  });

  it('skips an event missing "type" and warns', () => {
    const model = parseDataManagerEvents({
      default_group: { events: [{ description: 'no type' }] },
    });
    expect(model.events).toEqual([]);
    expect(model.warnings.some((w) => w.includes('type'))).toBe(true);
  });

  it('skips a malformed groups[] entry with a warning, and ignores a non-array groups', () => {
    const model = parseDataManagerEvents({ groups: ['not-an-object', { name: 'X' }] });
    expect(model.warnings.length).toBeGreaterThan(0);
    expect(model.group_order).toEqual(['X']);

    const model2 = parseDataManagerEvents({ groups: 'nope' });
    expect(model2.group_order).toEqual([]);
    expect(model2.warnings.length).toBeGreaterThan(0);
  });

  it('detects the Data Manager customers shape (events nested under "properties") and warns instead of silently parsing 0 events', () => {
    const model = parseDataManagerEvents({
      default_group: { properties: [{ property: 'city', type: 'string' }] },
    });
    expect(model.events).toEqual([]);
    expect(model.warnings.some((w) => /customers export/.test(w))).toBe(true);
  });

  it('a duplicate event type across the file collapses to one event (last wins) and warns once', () => {
    const model = parseDataManagerEvents({
      default_group: { events: [{ type: 'x', description: 'first' }] },
      groups: [{ name: 'G', events: [{ type: 'x', description: 'second' }] }],
    });
    expect(model.events).toHaveLength(1);
    expect(model.events[0]).toMatchObject({ type: 'x', description: 'second', group: 'G' });
    expect(model.warnings.filter((w) => w.includes('defined more than once'))).toHaveLength(1);
  });

  it('parses per-event property flags and a non-default property group', () => {
    const model = parseDataManagerEvents({
      default_group: {
        events: [
          {
            type: 'purchase',
            properties: {
              are_all_used: true,
              default_group: { properties: [{ property: 'total_price', type: 'number', source: 'user' }] },
              groups: [{ name: 'Shipping', properties: [{ property: 'carrier', type: 'string', private: true }] }],
            },
          },
        ],
      },
    });
    expect(model.events[0].properties_are_all_used).toBe(true);
    expect(model.events[0].properties).toEqual([
      expect.objectContaining({ property: 'total_price', type: 'number', group: null }),
      expect.objectContaining({ property: 'carrier', type: 'string', private: true, group: 'Shipping' }),
    ]);
  });

  it('keeps null and the literal "(empty)" sentinel distinct on description/example_values, on both events and properties', () => {
    const model = parseDataManagerEvents({
      default_group: {
        events: [
          { type: 'a', description: null, properties: { default_group: { properties: [] } } },
          { type: 'b', description: '(empty)', properties: { default_group: { properties: [] } } },
        ],
      },
    });
    expect(model.events[0]).toMatchObject({ description: null });
    expect(model.events[1]).toMatchObject({ description: '(empty)' });
  });
});

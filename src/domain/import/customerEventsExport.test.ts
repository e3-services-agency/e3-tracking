import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { parseCustomerEventsExport } from './customerEventsExport';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const FIXTURE_PATH = path.resolve(__dirname, '../../../.claude/team/samples/customer-events-export.json');
const fixtureJson = JSON.parse(readFileSync(FIXTURE_PATH, 'utf-8'));

describe('parseCustomerEventsExport', () => {
  it('parses the fixture header and every event with types preserved exactly', () => {
    const model = parseCustomerEventsExport(fixtureJson);
    expect(model.warnings).toEqual([]);
    expect(model.customer_id).toBe('666a00c0c818dcd371f98040');
    expect(model.project).toBe('e3');
    expect(model.url).toContain('bloomreach.com');
    expect(model.events_listed).toBe(19);
    expect(model.events).toHaveLength(19);

    const purchase = model.events.find((e) => e.type === 'purchase');
    expect(purchase).toBeDefined();
    // Values keep their JSON types exactly (plan contract): total_price stays a string "28",
    // product_ids stays an array.
    expect(purchase?.properties.total_price).toBe('28');
    expect(Array.isArray(purchase?.properties.product_ids)).toBe(true);

    const purchaseItem = model.events.find((e) => e.type === 'purchase_item');
    expect(purchaseItem?.properties.is_new).toBe('TRUE');
    expect(purchaseItem?.properties.price).toBe('28.4');

    const cartUpdate = model.events.find((e) => e.type === 'cart_update');
    expect(cartUpdate?.properties.product_ids).toBe('102589'); // string here, array on purchase (shape_inconsistent fixture)
  });

  it('keeps sub-second timestamp precision (managed_endpoint fixture row)', () => {
    const model = parseCustomerEventsExport(fixtureJson);
    const managed = model.events.find((e) => e.type === 'managed_endpoint');
    expect(managed?.timestamp).toBeCloseTo(1778232949.3897672, 5);
  });

  it('rejects a non-object payload with a warning and no events', () => {
    const model = parseCustomerEventsExport('not an object');
    expect(model.events).toEqual([]);
    expect(model.warnings.length).toBeGreaterThan(0);
  });

  it('skips a malformed event (missing type) with a warning, keeping the rest', () => {
    const model = parseCustomerEventsExport({
      events: [
        { timestamp: 123, properties: {} },
        { type: 'view_item', timestamp: 456, properties: { price: '10' } },
      ],
    });
    expect(model.events).toHaveLength(1);
    expect(model.events[0].type).toBe('view_item');
    expect(model.warnings.some((w) => w.includes('type'))).toBe(true);
  });

  it('skips an event with a non-numeric timestamp, with a warning', () => {
    const model = parseCustomerEventsExport({ events: [{ type: 'view_item', timestamp: 'not-a-number', properties: {} }] });
    expect(model.events).toEqual([]);
    expect(model.warnings.some((w) => w.includes('timestamp'))).toBe(true);
  });

  it('treats a non-object properties field as empty, with a warning', () => {
    const model = parseCustomerEventsExport({ events: [{ type: 'view_item', timestamp: 1, properties: 'oops' }] });
    expect(model.events).toHaveLength(1);
    expect(model.events[0].properties).toEqual({});
    expect(model.warnings.some((w) => w.includes('properties'))).toBe(true);
  });

  it('treats a missing events array as empty, with a warning', () => {
    const model = parseCustomerEventsExport({ customer_id: 'abc' });
    expect(model.events).toEqual([]);
    expect(model.warnings.some((w) => w.includes('events'))).toBe(true);
  });
});

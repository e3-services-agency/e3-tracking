import { describe, it, expect } from 'vitest';
import { parseCustomerEventsExport } from './customerEventsExport';
import { parseDataManagerEvents } from './dataManagerEvents';
import { parseDataManagerCustomers } from './dataManagerCustomers';
import { qaSampleFacts, qaSampleSummaryLine } from './qaSampleManifest';
import { isMaskedValue } from '../redaction';
import { buildQaSampleDocs } from './__fixtures__/qa-sample/build';

const docs = buildQaSampleDocs();

describe('customer events export, array form', () => {
  it('merges per-customer events and keeps customer_id per event', () => {
    const m = parseCustomerEventsExport(docs.customer_events);
    expect(m.events).toHaveLength(20);
    expect(m.customer_count).toBe(3);
    expect(new Set(m.events.map((e) => e.type)).size).toBe(4);
    expect(m.events.every((e) => typeof e.customer_id === 'string')).toBe(true);
  });
  it('warns per bad element and keeps the rest', () => {
    const m = parseCustomerEventsExport([{ customer_id: 'a', events: [{ type: 'x' }] }, 5, { customer_id: 'b', events: [{ type: 'y', timestamp: 1, properties: {} }] }]);
    expect(m.events).toHaveLength(1);
    expect(m.warnings.some((w) => w.startsWith('[0]'))).toBe(true);
    expect(m.warnings.some((w) => w.startsWith('[1]'))).toBe(true);
  });
  it('still accepts the single-object form', () => {
    const m = parseCustomerEventsExport({ customer_id: 'a', events: [{ type: 'x', timestamp: 1, properties: {} }] });
    expect(m.customer_id).toBe('a');
    expect(m.customer_count).toBe(0);
  });
});

describe('Data Manager project/schemas wrapper', () => {
  it('events: wrapper and bare shape parse identically', () => {
    const wrapped = parseDataManagerEvents(docs.data_manager_events);
    const bare = parseDataManagerEvents(docs.data_manager_events.events);
    expect(wrapped.events).toHaveLength(4);
    expect(wrapped).toEqual(bare);
  });
  it('customers: wrapper and bare shape parse identically', () => {
    const wrapped = parseDataManagerCustomers(docs.data_manager_events);
    const bare = parseDataManagerCustomers(docs.data_manager_events.customer_properties);
    expect(wrapped.properties).toHaveLength(2);
    expect(wrapped).toEqual(bare);
  });
});

describe('isMaskedValue and manifest facts', () => {
  it('recognises masked shapes only', () => {
    expect(isMaskedValue('[redacted]@example.com')).toBe(true);
    expect(isMaskedValue('[redacted:geo]')).toBe(true);
    expect(isMaskedValue('[redacted:ip]')).toBe(true);
    expect(isMaskedValue('redacted')).toBe(false);
    expect(isMaskedValue(12)).toBe(false);
  });
  it('reads facts', () => {
    const f = qaSampleFacts(docs.manifest);
    expect(f.matched).toBe(1234);
    expect(qaSampleSummaryLine(f)).toBe('spaced_clusters, read 3 of 3 requested, 1234 matched');
    expect(qaSampleFacts(null).redacted).toBe(false);
  });
});

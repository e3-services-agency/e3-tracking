/**
 * Expiration settings import service tests (T-1-08): fixture diff on an empty project (six events
 * plus the project default), apply, apply idempotence, stale hash 409, deselect skips, export
 * round trip.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as VariantDAL from '../dal/variant.dal';
import { previewExpirationSettings, applyExpirationSettings } from './expirationSettingsImport.service';
import { exportExpirationSettings } from './bloomreachExport.service';
import { PayloadChangedError } from '../errors';

const fixturePath = path.resolve(__dirname, '../../../.claude/team/samples/expiration-settings.json');
const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf-8'));

let projectId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('previewExpirationSettings on an empty project', () => {
  it('proposes six event creates plus a project default update', () => {
    const preview = previewExpirationSettings(projectId, fixture);
    const eventItems = preview.items.filter((i) => i.entity_type === 'event');
    expect(eventItems.map((i) => i.entity_key).sort()).toEqual(
      ['session_start', 'session_end', 'page_visit', 'web_exit', 'consent', 'notification_state'].sort()
    );
    expect(eventItems.every((i) => i.op === 'create')).toBe(true);

    const sessionStart = eventItems.find((i) => i.entity_key === 'session_start')!;
    expect(sessionStart.note).toContain('3 months');
    const consent = eventItems.find((i) => i.entity_key === 'consent')!;
    expect(consent.note).toContain('disabled');

    const projectItem = preview.items.find((i) => i.entity_type === 'project')!;
    expect(projectItem.entity_key).toBe('default_expiration_json');
  });
});

describe('applyExpirationSettings', () => {
  it('creates all six events with the right expiration and sets the project default', () => {
    const preview = previewExpirationSettings(projectId, fixture);
    applyExpirationSettings(
      projectId,
      fixture,
      preview.payload_hash,
      preview.items.map((i) => i.id)
    );

    const events = EventDAL.listEvents(projectId);
    const sessionStart = events.find((e) => e.name === 'session_start')!;
    expect(sessionStart.expiration_json).toEqual({ enabled: true, count: 3, units: 'months' });
    expect(sessionStart.event_type).toBe('system');

    const consent = events.find((e) => e.name === 'consent')!;
    expect(consent.expiration_json).toEqual({ enabled: false, count: null, units: null });

    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.default_expiration_json).toEqual({ enabled: false, count: null, units: null });
  });

  it('is idempotent: a second preview after a full apply proposes no create items', () => {
    const first = previewExpirationSettings(projectId, fixture);
    applyExpirationSettings(
      projectId,
      fixture,
      first.payload_hash,
      first.items.map((i) => i.id)
    );
    const second = previewExpirationSettings(projectId, fixture);
    expect(second.items.filter((i) => i.op === 'create')).toEqual([]);
  });

  it('rejects apply with a stale hash (409 PAYLOAD_CHANGED)', () => {
    const preview = previewExpirationSettings(projectId, fixture);
    expect(() =>
      applyExpirationSettings(projectId, fixture, 'stale-hash', preview.items.map((i) => i.id))
    ).toThrow(PayloadChangedError);
  });

  it('skips a deselected item', () => {
    const preview = previewExpirationSettings(projectId, fixture);
    const consentItem = preview.items.find((i) => i.entity_key === 'consent')!;
    const selected = preview.items.filter((i) => i.id !== consentItem.id).map((i) => i.id);

    const summary = applyExpirationSettings(projectId, fixture, preview.payload_hash, selected);
    expect(summary.skipped).toEqual([consentItem.id]);
    expect(EventDAL.listEvents(projectId).find((e) => e.name === 'consent')).toBeUndefined();
  });
});

// fix round (2026-09-24 22:36 reviewer FAIL) regression test.
describe('fix round: ERROR 3 - a filtered expiration entry targets the Variant, not the Event', () => {
  it('two entries for the same event type (one plain, one filtered) each get their own DiffItem and write the right target', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, role: 'discriminator' });
    VariantDAL.createVariant(projectId, event.id, {
      conditions: [{ property_id: property.id, operator: 'equals', values: ['add'] }],
    });

    const raw = {
      events: [
        {
          type: 'cart_update',
          filter: [],
          expiration: { enabled: true, duration: { count: 3, units: 'months' } },
        },
        {
          type: 'cart_update',
          filter: [
            {
              attribute: { property: 'action', type: 'property' },
              constraint: { operands: [{ type: 'constant', value: 'add' }], operator: 'equals', type: 'string' },
            },
          ],
          expiration: { enabled: true, duration: { count: 1, units: 'years' } },
        },
      ],
      other: { enabled: false, duration: null },
    };

    const preview = previewExpirationSettings(projectId, raw);
    const eventItem = preview.items.find((i) => i.entity_type === 'event' && i.entity_key === 'cart_update');
    const variantItem = preview.items.find((i) => i.entity_type === 'variant');
    expect(eventItem).toBeDefined();
    expect(variantItem).toBeDefined();
    expect(eventItem!.id).not.toBe(variantItem!.id); // unique per entry (no duplicate DiffItem ids)
    expect(variantItem!.entity_key).toBe('cart_update[action=add]');

    const summary = applyExpirationSettings(projectId, raw, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.skipped).toEqual([]);

    const updatedEvent = EventDAL.listEvents(projectId).find((e) => e.name === 'cart_update')!;
    expect(updatedEvent.expiration_json).toEqual({ enabled: true, count: 3, units: 'months' });

    const variant = VariantDAL.listVariants(projectId, event.id).find((v) => v.name === 'cart_update[action=add]')!;
    expect(variant.expiration_json).toEqual({ enabled: true, count: 1, units: 'years' });

    // Export emits `filter` from the variant's own conditions, not the whole-event entry's [].
    const exported = exportExpirationSettings(projectId);
    const entries = (exported.events as { type: string; filter: unknown[]; expiration: unknown }[]).filter(
      (e) => e.type === 'cart_update'
    );
    expect(entries).toHaveLength(2);
    const filteredEntry = entries.find((e) => e.filter.length > 0)!;
    expect(filteredEntry.filter).toEqual([
      {
        attribute: { property: 'action', type: 'property' },
        constraint: { operands: [{ type: 'constant', value: 'add' }], operator: 'equals', type: 'string' },
      },
    ]);
  });

  it('warns and skips (never falls back to the Event) when the filter property is not a discriminator', () => {
    EventDAL.createEvent(projectId, { name: 'cart_update' });
    const raw = {
      events: [
        {
          type: 'cart_update',
          filter: [
            {
              attribute: { property: 'action', type: 'property' },
              constraint: { operands: [{ type: 'constant', value: 'add' }], operator: 'equals', type: 'string' },
            },
          ],
          expiration: { enabled: true, duration: { count: 1, units: 'years' } },
        },
      ],
      other: { enabled: false, duration: null },
    };
    const preview = previewExpirationSettings(projectId, raw);
    expect(preview.items.some((i) => i.entity_type === 'event' || i.entity_type === 'variant')).toBe(false);
    expect(preview.warnings.some((w) => w.includes('action') && w.includes('discriminator'))).toBe(true);

    const updatedEvent = EventDAL.listEvents(projectId).find((e) => e.name === 'cart_update')!;
    expect(updatedEvent.expiration_json).toBeNull();
  });
});

// second fix round (2026-09-24 23:20 reviewer FAIL) regression tests.
describe('second fix round: LOW D - a filtered entry with a disallowed operand value warns and skips at preview', () => {
  it('does not propose a create item and never reaches apply (no 400)', () => {
    const event = EventDAL.createEvent(projectId, { name: 'cart_update' });
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'action',
      data_type: 'string',
      allowed_values_json: [{ value: 'add' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, role: 'discriminator' });

    const raw = {
      events: [
        {
          type: 'cart_update',
          filter: [
            {
              attribute: { property: 'action', type: 'property' },
              constraint: {
                operands: [
                  { type: 'constant', value: 'remove' },
                  { type: 'constant', value: 'add' },
                ],
                operator: 'in',
                type: 'string',
              },
            },
          ],
          expiration: { enabled: true, duration: { count: 7, units: 'days' } },
        },
      ],
      other: { enabled: false, duration: null },
    };

    const preview = previewExpirationSettings(projectId, raw);
    expect(preview.items.some((i) => i.entity_type === 'variant')).toBe(false);
    expect(preview.warnings.some((w) => w.includes('action') && w.includes('not in its allowed values'))).toBe(true);

    // Applying the (unaffected) selection never throws, and no variant was created - the
    // project-default item is unrelated to this filtered entry and is free to apply on its own.
    const summary = applyExpirationSettings(projectId, raw, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.applied.some((id) => id.startsWith('variant'))).toBe(false);
    expect(VariantDAL.listVariants(projectId, event.id)).toEqual([]);
  });
});

describe('second fix round: INFO F - a filtered entry for an event created earlier in the same paste', () => {
  it('warns with a distinct, actionable message instead of the generic "does not exist yet"', () => {
    const raw = {
      events: [
        {
          type: 'loyalty_scan',
          filter: [],
          expiration: { enabled: true, duration: { count: 30, units: 'days' } },
        },
        {
          type: 'loyalty_scan',
          filter: [
            {
              attribute: { property: 'channel', type: 'property' },
              constraint: { operands: [{ type: 'constant', value: 'app' }], operator: 'equals', type: 'string' },
            },
          ],
          expiration: { enabled: true, duration: { count: 7, units: 'days' } },
        },
      ],
      other: { enabled: false, duration: null },
    };

    const preview = previewExpirationSettings(projectId, raw);
    // The whole-event create is proposed and, once applied, the second import run resolves cleanly.
    expect(preview.items.some((i) => i.entity_type === 'event' && i.entity_key === 'loyalty_scan')).toBe(true);
    expect(preview.items.some((i) => i.entity_type === 'variant')).toBe(false);
    expect(
      preview.warnings.some((w) => w.includes('loyalty_scan') && w.includes('this same paste creates from scratch'))
    ).toBe(true);

    const summary = applyExpirationSettings(projectId, raw, preview.payload_hash, preview.items.map((i) => i.id));
    expect(summary.skipped).toEqual([]);
    const event = EventDAL.listEvents(projectId).find((e) => e.name === 'loyalty_scan')!;
    expect(event).toBeDefined();
    expect(event.expiration_json).toEqual({ enabled: true, count: 30, units: 'days' });

    // Documented limitation: the filtered entry still cannot resolve on this same paste, because
    // the expiration format never attaches a discriminator link itself - a discriminator on a
    // brand-new event cannot already exist. A follow-up run (once the property is linked as a
    // discriminator through a data-mapping import, say) would resolve it normally, same as any
    // other pre-existing event.
    const property = PropertyDAL.createProperty(projectId, {
      scope: 'event',
      name: 'channel',
      data_type: 'string',
      allowed_values_json: [{ value: 'app' }],
    });
    EventDAL.attachPropertyToEvent(projectId, event.id, { property_id: property.id, role: 'discriminator' });

    const second = previewExpirationSettings(projectId, raw);
    const variantItem = second.items.find((i) => i.entity_type === 'variant');
    expect(variantItem).toBeDefined();
    expect(variantItem!.entity_key).toBe('loyalty_scan[channel=app]');
  });
});

describe('exportExpirationSettings round trip', () => {
  it('deep-equals the fixture after import, ignoring key order and success', () => {
    const preview = previewExpirationSettings(projectId, fixture);
    applyExpirationSettings(
      projectId,
      fixture,
      preview.payload_hash,
      preview.items.map((i) => i.id)
    );

    const exported = exportExpirationSettings(projectId);
    const normalize = (v: unknown) => {
      const clone = JSON.parse(JSON.stringify(v)) as { events: { type: string }[]; success?: boolean };
      delete clone.success;
      clone.events = [...clone.events].sort((a, b) => a.type.localeCompare(b.type));
      return clone;
    };
    expect(normalize(exported)).toEqual(normalize(fixture));
  });
});

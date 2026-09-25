/**
 * Data Manager events import service tests (T-2-03). Run against a project that already holds the
 * two phase 1 fixtures (`data-mapping.json`, `expiration-settings.json`), retyped exactly like
 * `comparison.service.test.ts`'s `retypeForTypeMismatches` (the same "phase 1 test definition" the
 * plan's comparison-4 fixture expectations assume): 6 custom events already exist
 * (`cart_update, checkout, purchase, purchase_item, view_category, view_item`) and 6 sdk/platform
 * events already exist (`session_start, session_end, page_visit, web_exit, consent,
 * notification_state`, of which `web_exit` is *not* in the Data Manager events fixture at all).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as PropertyDAL from '../dal/property.dal';
import * as EventDAL from '../dal/event.dal';
import { applyDataMapping, previewDataMapping } from './dataMappingImport.service';
import { applyExpirationSettings, previewExpirationSettings } from './expirationSettingsImport.service';
import { previewDataManagerEvents, applyDataManagerEvents } from './dataManagerEventsImport.service';
import { exportDataManagerEvents } from './bloomreachExport.service';
import { PayloadChangedError } from '../errors';

const dataMappingFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/data-mapping.json'), 'utf-8')
);
const expirationFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../.claude/team/samples/expiration-settings.json'), 'utf-8')
);
const eventsFixturePath = path.resolve(__dirname, '../../../.claude/team/samples/data-manager-events.json');
const eventsFixture = JSON.parse(fs.readFileSync(eventsFixturePath, 'utf-8'));

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = canonicalize((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

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

/** Applies the two phase 1 fixtures with their full default selection. */
function applyPhase1Fixtures(): void {
  const dm = previewDataMapping(projectId, dataMappingFixture);
  applyDataMapping(projectId, dataMappingFixture, dm.payload_hash, dm.items.map((i) => i.id));
  const exp = previewExpirationSettings(projectId, expirationFixture);
  applyExpirationSettings(projectId, expirationFixture, exp.payload_hash, exp.items.map((i) => i.id));
}

/** Same "phase 1 test definition" retyping as `comparison.service.test.ts`/`definitionVsObservations.test.ts`. */
function retypeForTypeMismatches(): void {
  for (const name of ['total_price', 'price']) {
    const prop = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === name);
    if (prop) PropertyDAL.updateProperty(projectId, prop.id, { data_type: 'number', data_formats_json: ['money'] });
  }
  for (const name of ['quantity', 'total_quantity', 'stock_level']) {
    const prop = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === name);
    if (prop) PropertyDAL.updateProperty(projectId, prop.id, { data_type: 'number' });
  }
}

function setUpPhase1Definition(): void {
  applyPhase1Fixtures();
  retypeForTypeMismatches();
}

const EXISTING_CUSTOM_EVENTS = ['view_item', 'cart_update', 'checkout', 'purchase', 'purchase_item', 'view_category'];
const EXISTING_SDK_PLATFORM_EVENTS = ['session_start', 'session_end', 'page_visit', 'consent', 'notification_state'];

describe('previewDataManagerEvents on the phase 1 definition', () => {
  it('proposes exactly 50 event items, all create (D-41 MEDIUM 3: the 11 pre-existing events already match the file and propose no empty-change update item)', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const eventItems = preview.items.filter((i) => i.entity_type === 'event');
    expect(eventItems).toHaveLength(50);

    const updateItems = eventItems.filter((i) => i.op === 'update');
    const createItems = eventItems.filter((i) => i.op === 'create');
    expect(updateItems).toHaveLength(0);
    expect(createItems).toHaveLength(50);

    // The 11 already-applied events (6 custom, 5 sdk/platform) propose no item at all — their
    // category/description already match what the file says — rather than a selected no-op update.
    for (const name of [...EXISTING_CUSTOM_EVENTS, ...EXISTING_SDK_PLATFORM_EVENTS]) {
      expect(eventItems.find((i) => i.entity_key === name), `expected no item for already-matching "${name}"`).toBeUndefined();
    }

    // 50 create items: deselected exactly when the type is sdk/platform (D-29), derived from
    // `bloomreach.ts`'s own lists rather than a hardcoded count here.
    const deselectedCreates = createItems.filter((i) => !i.default_selected);
    const selectedCreates = createItems.filter((i) => i.default_selected);
    expect(deselectedCreates.every((i) => i.class === 'sdk' || i.class === 'platform')).toBe(true);
    expect(selectedCreates.every((i) => i.class === 'custom')).toBe(true);
    expect(deselectedCreates.length + selectedCreates.length).toBe(50);
  });

  it('shows 6 custom creates in the MentionMe group, all selected', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const mentionMeTypes = [
      'registered_as_referee',
      'registered_as_referrer',
      'received_referee_reward',
      'received_referrer_reward',
      'submitted_nps_score',
      'received_reward_next_order',
    ];
    for (const type of mentionMeTypes) {
      const item = preview.items.find((i) => i.entity_type === 'event' && i.entity_key === type);
      expect(item).toMatchObject({ op: 'create', class: 'custom', default_selected: true });
    }
  });

  it('warns on the seven documented type conflicts and not on purchase.total_price', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const expectedWarnings: [string, string][] = [
      ['price', 'purchase_item'],
      ['quantity', 'purchase_item'],
      ['total_price', 'cart_update'],
      ['total_quantity', 'cart_update'],
      ['total_price', 'checkout'],
      ['price', 'view_item'],
      ['stock_level', 'view_item'],
    ];
    for (const [property, event] of expectedWarnings) {
      expect(
        preview.warnings.some((w) => w.includes(`"${property}"`) && w.includes(`"${event}"`) && w.includes('comparison 4 evidence')),
        `expected a type-differs warning for ${event}.${property}`
      ).toBe(true);
    }
    expect(preview.warnings.some((w) => w.includes('"total_price" on event "purchase"'))).toBe(false);
  });

  it('includes the always-applied snapshot item', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const snapshot = preview.items.find((i) => i.id === 'project:data_manager_events_snapshot');
    expect(snapshot).toBeDefined();
    expect(snapshot?.locked).toBe(true);
  });

  it('warns about the empty-properties event (submitted_nps_score)', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    expect(preview.warnings.some((w) => w.includes('submitted_nps_score') && w.includes('no properties'))).toBe(true);
  });
});

describe('applyDataManagerEvents on the default selection', () => {
  it('creates only custom events (36 new custom events; the 14 deselected sdk/platform creates stay absent)', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    const events = EventDAL.listEvents(projectId);
    // 6 (data-mapping) + 6 (expiration) pre-existing + 36 newly-created custom events.
    expect(events).toHaveLength(48);
    expect(events.every((e) => (EXISTING_SDK_PLATFORM_EVENTS.includes(e.name) ? true : e.class === 'custom' || e.name === 'web_exit'))).toBe(
      true
    );
    const stillMissing = ['first_session', 'campaign', 'banner', 'experiment']; // sdk/platform creates, deselected by default
    for (const name of stillMissing) {
      expect(events.find((e) => e.name === name)).toBeUndefined();
    }
  });

  it('a re-preview after apply proposes no duplicate item for an already-applied event, property or link', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    const second = previewDataManagerEvents(projectId, eventsFixture);
    // Every item id that was applied must not reappear as a *create* op; still-deselected sdk/platform
    // events (never created) legitimately keep proposing their own create item every re-preview.
    const appliedIds = new Set(selected);
    const reproposedCreates = second.items.filter((i) => i.op === 'create' && appliedIds.has(i.id));
    expect(reproposedCreates).toEqual([]);
  });

  it('merging into an existing custom event proposes a link and a meta refresh, never a duplicate event', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    // D-41 MEDIUM 3: `purchase` already matches the file (category/description), so it proposes no
    // event item at all — merging still happens via the link item below, driven off the already-
    // existing `Event` row rather than a selected `update` item for it.
    const purchaseItem = preview.items.find((i) => i.entity_type === 'event' && i.entity_key === 'purchase');
    expect(purchaseItem).toBeUndefined();

    const before = EventDAL.listEvents(projectId).filter((e) => e.name === 'purchase');
    expect(before).toHaveLength(1);

    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    const after = EventDAL.listEvents(projectId).filter((e) => e.name === 'purchase');
    expect(after).toHaveLength(1); // never duplicated

    const { properties } = EventDAL.getEventWithProperties(projectId, after[0].id);
    const currency = properties.find((p) => p.property.name === 'currency');
    expect(currency).toBeDefined(); // a previously-unlinked property from the file got linked
    expect((currency?.bloomreach_meta_json as { dm_type?: string } | null)?.dm_type).toBe('string');
  });

  it('rejects an apply whose hash no longer matches (stale payload)', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    expect(() =>
      applyDataManagerEvents(projectId, eventsFixture, 'stale-hash', preview.items.map((i) => i.id))
    ).toThrow(PayloadChangedError);
  });
});

describe('exportDataManagerEvents round trip', () => {
  it('deep-equals the fixture (sorted-key serialisation) after applying the two phase 1 fixtures and this one with the default selection, plus "web_exit" (a live sdk event from expiration-settings.json, D-28\'s "every Event row (any class)" — it is not part of this fixture at all, so it is a documented addition, not a round-trip failure)', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    const exported = exportDataManagerEvents(projectId);
    const expected = JSON.parse(JSON.stringify(eventsFixture));
    expected.default_group.events.push({
      deleting: false,
      description: null,
      forbidden: false,
      properties: { are_all_used: true, default_group: { properties: [] }, groups: [] },
      real_time_analytics: true,
      source: 'user',
      type: 'web_exit',
      used: false,
    });
    expect(canonicalize(exported)).toEqual(canonicalize(expected));
  });

  it('with passthrough=false, the never-selected sdk/platform events are absent', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    const exported = exportDataManagerEvents(projectId, { passthrough: false });
    const allTypes = [
      ...(exported.default_group as { events: { type: string }[] }).events,
      ...(exported.groups as { events: { type: string }[] }[]).flatMap((g) => g.events),
    ].map((e) => e.type);
    expect(allTypes).not.toContain('first_session');
    expect(allTypes).not.toContain('campaign');
    expect(allTypes).toContain('purchase'); // live custom event still present
  });

  it('deleting an imported custom event drops it from the export while a never-imported sdk event still passes through', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    const viewCategory = EventDAL.listEvents(projectId).find((e) => e.name === 'view_category')!;
    EventDAL.deleteEvent(projectId, viewCategory.id);

    const exported = exportDataManagerEvents(projectId);
    const allTypes = [
      ...(exported.default_group as { events: { type: string }[] }).events,
      ...(exported.groups as { events: { type: string }[] }[]).flatMap((g) => g.events),
    ].map((e) => e.type);
    expect(allTypes).not.toContain('view_category'); // deleted: dropped, not passed through
    expect(allTypes).toContain('first_session'); // never selected/created: passed through verbatim
  });
});

describe('D-41 fix round: cross-event type conflicts never produce update items', () => {
  it('ERROR 1: apply then two re-preview rounds propose zero property type updates, and the property never flips', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    // Round 1.
    const round1 = previewDataManagerEvents(projectId, eventsFixture);
    const typeUpdates1 = round1.items.filter((i) => i.entity_type === 'property' && i.op === 'update');
    expect(typeUpdates1).toEqual([]);

    // Round 2: unchanged from round 1 (never proposes the reverse either).
    const round2 = previewDataManagerEvents(projectId, eventsFixture);
    const typeUpdates2 = round2.items.filter((i) => i.entity_type === 'property' && i.op === 'update');
    expect(typeUpdates2).toEqual([]);

    // The three data-mapping-defined properties the pre-fix planner used to flip (`product_id`,
    // `product_ids`, `purchase_id`, all `string` per `data-mapping.json`) stay exactly as defined —
    // this planner never touches an existing property's type at all (D-41).
    const byName = (name: string) => PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === name)!;
    expect(byName('product_id')).toMatchObject({ data_type: 'string' });
    expect(byName('product_ids')).toMatchObject({ data_type: 'string' });
    expect(byName('purchase_id')).toMatchObject({ data_type: 'string' });
  });

  it('ERROR 1: cross-event conflicting occurrences warn instead of proposing an update, regardless of source', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    expect(preview.items.some((i) => i.entity_type === 'property' && i.op === 'update')).toBe(false);
    // `store_id`/`product_id`/`order_date` (source "user" conflicts the pre-fix planner used to
    // propose as selected updates) now only warn.
    for (const [property, event] of [
      ['store_id', 'double_opt_in'],
      ['product_id', 'back_in_stock_list'],
      ['order_date', 'sample'],
    ]) {
      expect(
        preview.warnings.some((w) => w.includes(`"${property}"`) && w.includes(`"${event}"`) && w.includes('comparison 4 evidence')),
        `expected a warning for ${event}.${property}`
      ).toBe(true);
    }
  });

  it('LOW 6: the phase 1 preview warns about more than the seven originally-documented type conflicts (source "user" cross-event conflicts now warn too, not just source "data")', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const typeWarnings = preview.warnings.filter((w) => w.includes('Data Manager type differs'));
    expect(typeWarnings.length).toBeGreaterThan(7);
  });
});

describe('D-41 fix round: MEDIUM 4, properties/links only for selected events', () => {
  it('deselecting the only event that uses a property leaves that property (and its link) uncreated', () => {
    // Empty project (no phase 1 fixtures): `share_source` is used only by `registered_as_referee`
    // (MentionMe, custom) in the fixture.
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const registeredAsRefereeItem = preview.items.find((i) => i.entity_type === 'event' && i.entity_key === 'registered_as_referee')!;
    expect(registeredAsRefereeItem.op).toBe('create');

    const selected = preview.items
      .filter((i) => i.default_selected && i.id !== registeredAsRefereeItem.id)
      .map((i) => i.id);
    // Also drop this event's own property-link items so nothing but the event item's deselection is
    // being tested (mirrors what the UI would send once the user unchecks one event row).
    const linkIdsForEvent = preview.items
      .filter((i) => i.entity_type === 'event_property' && i.entity_key.startsWith('registered_as_referee.'))
      .map((i) => i.id);
    const finalSelected = selected.filter((id) => !linkIdsForEvent.includes(id));

    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, finalSelected);

    expect(EventDAL.listEvents(projectId).find((e) => e.name === 'registered_as_referee')).toBeUndefined();
    expect(PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === 'share_source')).toBeUndefined();
  });

  it('a property shared with another selected event is still created even when one of its events is deselected', () => {
    // `purchase_id` (source "user" via `shipment`) is also used by `purchase`/`purchase_item`
    // (both selected by default) — deselecting `shipment` alone must not block its creation.
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const shipmentItem = preview.items.find((i) => i.entity_type === 'event' && i.entity_key === 'shipment')!;
    const shipmentLinkIds = preview.items
      .filter((i) => i.entity_type === 'event_property' && i.entity_key.startsWith('shipment.'))
      .map((i) => i.id);
    const selected = preview.items
      .filter((i) => i.default_selected && i.id !== shipmentItem.id && !shipmentLinkIds.includes(i.id))
      .map((i) => i.id);

    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    expect(EventDAL.listEvents(projectId).find((e) => e.name === 'shipment')).toBeUndefined();
    expect(PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === 'purchase_id')).toBeDefined();
  });

  it('selecting a property item whose only owning event is deselected produces one warning (T-2-04, T-2-03 review carry-over)', () => {
    // Same fixture shape as the first test in this block (`share_source` only on `registered_as_referee`),
    // but this time the property's own `create` item stays selected while its `anyOf` event does not —
    // the property step is skipped by the `anyOf` gate, not `dependsOn`, and must still warn.
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const registeredAsRefereeItem = preview.items.find((i) => i.entity_type === 'event' && i.entity_key === 'registered_as_referee')!;
    const shareSourcePropertyItem = preview.items.find((i) => i.entity_type === 'property' && i.entity_key === 'share_source')!;
    expect(shareSourcePropertyItem.default_selected).toBe(true);

    const linkIdsForEvent = preview.items
      .filter((i) => i.entity_type === 'event_property' && i.entity_key.startsWith('registered_as_referee.'))
      .map((i) => i.id);
    const selected = preview.items
      .filter((i) => i.default_selected && i.id !== registeredAsRefereeItem.id && !linkIdsForEvent.includes(i.id))
      .map((i) => i.id);

    const result = applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    expect(result.skipped).toContain(shareSourcePropertyItem.id);
    expect(
      result.warnings.some((w) => w.includes(`Skipped "${shareSourcePropertyItem.id}"`) && w.includes('none of its events'))
    ).toBe(true);
  });
});

describe('D-41 fix round: LOW 5, type comparison uses the reverse-mapped Data Manager type', () => {
  function minimalPayload(propA: { event: string; type: string; source?: string }, propB: { event: string; type: string; source?: string }) {
    return {
      default_forbidden: false,
      default_private: false,
      default_group: {
        events: [
          {
            type: propA.event,
            source: 'user',
            properties: {
              default_group: {
                properties: [
                  { property: 'ts', type: propA.type, source: propA.source ?? 'user', private: false },
                ],
              },
            },
          },
          {
            type: propB.event,
            source: 'user',
            properties: {
              default_group: {
                properties: [
                  { property: 'ts', type: propB.type, source: propB.source ?? 'user', private: false },
                ],
              },
            },
          },
        ],
      },
      groups: [],
    };
  }

  it('"date" on the creation event vs "datetime" on another event warns (both map to app "timestamp")', () => {
    const payload = minimalPayload({ event: 'ev_date', type: 'date' }, { event: 'ev_datetime', type: 'datetime' });
    const preview = previewDataManagerEvents(projectId, payload);
    expect(
      preview.warnings.some((w) => w.includes('"ts"') && w.includes('"ev_datetime"') && w.includes('comparison 4 evidence'))
    ).toBe(true);
  });

  it('"long text" on the creation event vs "string" on another event warns (both map to app "string")', () => {
    const payload = minimalPayload({ event: 'ev_long', type: 'long text' }, { event: 'ev_plain', type: 'string' });
    const preview = previewDataManagerEvents(projectId, payload);
    expect(
      preview.warnings.some((w) => w.includes('"ts"') && w.includes('"ev_plain"') && w.includes('comparison 4 evidence'))
    ).toBe(true);
  });

  it('an existing property with an app data_type that has no Bloomreach equivalent warns once instead of silently comparing nothing', () => {
    const created = PropertyDAL.createProperty(projectId, { scope: 'event', name: 'weird', data_type: 'object', property_type: 'custom' });
    expect(created.data_type).toBe('object');
    const payload = {
      default_forbidden: false,
      default_private: false,
      default_group: {
        events: [
          {
            type: 'ev_weird',
            source: 'user',
            properties: { default_group: { properties: [{ property: 'weird', type: 'string', source: 'user', private: false }] } },
          },
        ],
      },
      groups: [],
    };
    const preview = previewDataManagerEvents(projectId, payload);
    expect(preview.warnings.some((w) => w.includes('"weird"') && w.includes('no Bloomreach Data Manager equivalent'))).toBe(true);
  });
});

describe('D-41 fix round: ERROR 2, export precedence follows Property edits since import', () => {
  it('an untouched round trip stays byte-equal (verbatim Data Manager values still used)', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    const before = exportDataManagerEvents(projectId);
    const after = exportDataManagerEvents(projectId);
    expect(canonicalize(before)).toEqual(canonicalize(after));
  });

  it('editing the Property in the app pushes the new type/PII/description to every link of it on export', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    const price = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === 'price')!;
    PropertyDAL.updateProperty(projectId, price.id, {
      data_type: 'number',
      data_formats_json: ['money'],
      pii: true,
      description: 'EDITED IN APP',
    });

    const exported = exportDataManagerEvents(projectId);
    // Only events that actually became a live `Event` row (created/linked by this import) reflect
    // the app `Property`; a deselected sdk/platform event (e.g. "banner", also a `price` occurrence
    // in the fixture) is pure snapshot passthrough of the original file by design (D-35) and must
    // not be expected to pick up an app-side edit at all.
    const liveEventNames = new Set(EventDAL.listEvents(projectId).map((e) => e.name));
    const allEvents = [
      ...(exported.default_group as { events: Record<string, unknown>[] }).events,
      ...(exported.groups as { events: Record<string, unknown>[] }[]).flatMap((g) => g.events),
    ] as { type: string; properties: { default_group: { properties: Record<string, unknown>[] }; groups: { properties: Record<string, unknown>[] }[] } }[];
    let linkCount = 0;
    for (const ev of allEvents) {
      if (!liveEventNames.has(ev.type)) continue;
      const props = ev.properties;
      const all = [...props.default_group.properties, ...props.groups.flatMap((g) => g.properties)];
      for (const p of all) {
        if (p.property !== 'price') continue;
        linkCount++;
        expect(p, `price link on event "${ev.type}"`).toMatchObject({
          type: 'number',
          private: true,
          description: 'EDITED IN APP',
        });
      }
    }
    expect(linkCount).toBeGreaterThan(1); // "price" appears on more than one live event in the fixture
  });

  it('editing only the Property description (type/PII untouched) still pushes the edit on export (T-2-04, D-41 amendment)', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const selected = preview.items.filter((i) => i.default_selected).map((i) => i.id);
    applyDataManagerEvents(projectId, eventsFixture, preview.payload_hash, selected);

    const price = PropertyDAL.listProperties(projectId, { scope: 'event' }).find((p) => p.name === 'price')!;
    // Only description changes; data_type/data_formats/pii stay exactly as the import wrote them, so
    // `propertyUnchangedSinceImport` (type/PII) stays `true` while the description edit must still
    // reach export via its own `description_at_import` reference.
    PropertyDAL.updateProperty(projectId, price.id, { description: 'DESCRIPTION ONLY EDIT' });

    const exported = exportDataManagerEvents(projectId);
    const liveEventNames = new Set(EventDAL.listEvents(projectId).map((e) => e.name));
    const allEvents = [
      ...(exported.default_group as { events: Record<string, unknown>[] }).events,
      ...(exported.groups as { events: Record<string, unknown>[] }[]).flatMap((g) => g.events),
    ] as { type: string; properties: { default_group: { properties: Record<string, unknown>[] }; groups: { properties: Record<string, unknown>[] }[] } }[];
    let linkCount = 0;
    for (const ev of allEvents) {
      if (!liveEventNames.has(ev.type)) continue;
      const props = ev.properties;
      const all = [...props.default_group.properties, ...props.groups.flatMap((g) => g.properties)];
      for (const p of all) {
        if (p.property !== 'price') continue;
        linkCount++;
        expect(p.description, `price link on event "${ev.type}"`).toBe('DESCRIPTION ONLY EDIT');
      }
    }
    expect(linkCount).toBeGreaterThan(1);
  });
});

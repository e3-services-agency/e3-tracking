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
  it('proposes exactly 61 event items: 11 update (6 custom selected, 5 sdk/platform deselected), 50 create', () => {
    setUpPhase1Definition();
    const preview = previewDataManagerEvents(projectId, eventsFixture);
    const eventItems = preview.items.filter((i) => i.entity_type === 'event');
    expect(eventItems).toHaveLength(61);

    const updateItems = eventItems.filter((i) => i.op === 'update');
    const createItems = eventItems.filter((i) => i.op === 'create');
    expect(updateItems).toHaveLength(11);
    expect(createItems).toHaveLength(50);

    for (const name of EXISTING_CUSTOM_EVENTS) {
      const item = updateItems.find((i) => i.entity_key === name);
      expect(item, `expected an update item for "${name}"`).toBeDefined();
      expect(item?.class).toBe('custom');
      expect(item?.default_selected).toBe(true);
    }
    for (const name of EXISTING_SDK_PLATFORM_EVENTS) {
      const item = updateItems.find((i) => i.entity_key === name);
      expect(item, `expected an update item for "${name}"`).toBeDefined();
      expect(item?.default_selected).toBe(false);
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
    const purchaseItem = preview.items.find((i) => i.entity_type === 'event' && i.entity_key === 'purchase');
    expect(purchaseItem?.op).toBe('update');

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

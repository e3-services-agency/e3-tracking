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

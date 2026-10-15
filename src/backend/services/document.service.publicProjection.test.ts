/**
 * `toPublicTrackingDocument` tests (D-48 amendment, fix round LOW 1, 2026-09-28): the projection
 * `routes/shared.ts`'s `GET /:token/tracking-document.json` applies before sending a tracking
 * document to an unauthenticated share visitor.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import { buildTrackingDocument, toPublicTrackingDocument, toTrackingDocumentSummary, buildPublicEventCard } from './document.service';

let projectId: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({
    client_id: client.id,
    key: 'acme-eu',
    name: 'Acme EU',
    bloomreach_project_url: 'https://app.exponea.com/secret-console',
  }).id;
  EventDAL.createEvent(projectId, {
    name: 'public_projection_unit_event',
    class: 'custom',
    identity_note: 'internal identity note',
    owner_business: 'Business Owner',
    owner_technical: 'Technical Owner',
    agent_instructions: 'Secret QA agent prompt',
    not_suitable_for: 'Not suitable for X (client-facing)',
  });
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('toPublicTrackingDocument (D-48 amendment)', () => {
  it('strips project.bloomreach_project_url', () => {
    const doc = buildTrackingDocument(projectId);
    const pub = toPublicTrackingDocument(doc);
    expect(doc.project.bloomreach_project_url).toBe('https://app.exponea.com/secret-console');
    expect(pub.project.bloomreach_project_url).toBeNull();
  });

  it('strips identity_note, owners and agent_instructions per event, keeps not_suitable_for', () => {
    const doc = buildTrackingDocument(projectId);
    const pub = toPublicTrackingDocument(doc);
    const internalEvent = doc.events.find((e) => e.name === 'public_projection_unit_event')!;
    const publicEvent = pub.events.find((e) => e.name === 'public_projection_unit_event')!;

    expect(internalEvent.identity_note).toBe('internal identity note');
    expect(internalEvent.owners).toEqual({ business: 'Business Owner', technical: 'Technical Owner' });
    expect(internalEvent.agent_instructions).toBe('Secret QA agent prompt');

    expect(publicEvent.identity_note).toBeNull();
    expect(publicEvent.owners).toEqual({ business: null, technical: null });
    expect('agent_instructions' in publicEvent).toBe(false);
    expect(publicEvent.not_suitable_for).toBe('Not suitable for X (client-facing)');
  });

  it('deep-strips any internal_* key at any depth (forward compatible with T-4-08)', () => {
    const doc = buildTrackingDocument(projectId);
    // Simulate a future internal_* field landing anywhere in the tree (T-4-08 adds internal_notes/
    // internal_url to use case templates/use cases; this proves the sweep needs no update then).
    const withFutureField = {
      ...doc,
      use_cases: [
        ...doc.use_cases,
        { code: 'UC-FUTURE', name: 'Future', type: null, status: null, narrative: null, requirements: [], internal_notes: 'secret note' } as unknown as (typeof doc.use_cases)[number],
      ],
    };
    const pub = toPublicTrackingDocument(withFutureField);
    expect(JSON.stringify(pub)).not.toContain('secret note');
    expect(JSON.stringify(pub)).not.toContain('internal_notes');
  });

  it('does not mutate the input document (buildTrackingDocument() stays untouched)', () => {
    const doc = buildTrackingDocument(projectId);
    const before = JSON.parse(JSON.stringify(doc));
    toPublicTrackingDocument(doc);
    expect(doc).toEqual(before);
  });

  it('leaves every other field byte-identical to the internal document (minus the stripped set and generated_at)', () => {
    const doc = buildTrackingDocument(projectId);
    const pub = toPublicTrackingDocument(doc);
    const normalize = (d: typeof doc) => ({
      ...d,
      generated_at: null,
      project: { ...d.project, bloomreach_project_url: null },
      events: d.events.map((e) => ({ ...e, identity_note: null, owners: { business: null, technical: null }, agent_instructions: null })),
    });
    expect(normalize(pub)).toEqual(normalize(doc));
  });
});

// T-5-41 (D-88): the lazy share routes take `toPublicTrackingDocument`'s output, so a future
// internal field anywhere in the tree is stripped for them exactly as for the full download.
describe('toTrackingDocumentSummary / buildPublicEventCard (T-5-41)', () => {
  it('a future internal_* key on an event card never reaches the summary or the card', () => {
    const doc = buildTrackingDocument(projectId);
    const withFutureField = {
      ...doc,
      events: doc.events.map((e) => ({ ...e, internal_review: 'secret review', properties: e.properties.map((p) => ({ ...p, internal_hint: 'secret hint' })) })),
    };
    const summary = toTrackingDocumentSummary(toPublicTrackingDocument(withFutureField));
    const pub = toPublicTrackingDocument(withFutureField);
    for (const text of [JSON.stringify(summary), JSON.stringify(pub.events)]) {
      expect(text).not.toContain('secret review');
      expect(text).not.toContain('secret hint');
      expect(text).not.toContain('internal_');
    }
  });

  it('the summary event is an allowlist: a new non-internal card field does not appear in it', () => {
    const doc = buildTrackingDocument(projectId);
    const withNewField = { ...doc, events: doc.events.map((e) => ({ ...e, some_future_field: 'x' })) };
    const summary = toTrackingDocumentSummary(toPublicTrackingDocument(withNewField));
    expect('some_future_field' in summary.events[0]).toBe(false);
    expect('identity_note' in summary.events[0]).toBe(false);
    expect('owners' in summary.events[0]).toBe(false);
  });

  it('buildPublicEventCard returns the public card for a project event and null for an unknown id', () => {
    const eventId = buildTrackingDocument(projectId).events[0].id;
    const card = buildPublicEventCard(projectId, eventId)!;
    expect(card.identity_note).toBeNull();
    expect('agent_instructions' in card).toBe(false);
    expect(buildPublicEventCard(projectId, 'no-such-event')).toBeNull();
  });

  it('a light build differs from the full build only in coverage and codegen', () => {
    const full = buildTrackingDocument(projectId);
    const light = buildTrackingDocument(projectId, { light: true });
    const strip = (d: typeof full) => ({ ...d, generated_at: null, events: d.events.map(({ coverage: _c, codegen: _g, ...e }) => e) });
    expect(strip(light)).toEqual(strip(full));
    expect(light.events[0].codegen).toEqual({ gtm: '', web_sdk: '', tracking_api: '' });
  });
});

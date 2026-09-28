/**
 * Route-level coverage (T-1-09): customer-events-export import, `/qa-runs`, `/observations`,
 * `/comparison/run`, `/findings`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import fs from 'node:fs';
import path from 'node:path';
import { closeDb } from '../../db';
import { createApp } from '../../app';
import * as ClientDAL from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';

const dataMappingFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../.claude/team/samples/data-mapping.json'), 'utf-8')
);
const eventsFixture = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../../../../.claude/team/samples/customer-events-export.json'), 'utf-8')
);

let server: http.Server;
let baseUrl: string;
let projectId: string;

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;

  const app = createApp();
  server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, resolve));
  const { port } = server.address() as AddressInfo;
  baseUrl = `http://127.0.0.1:${port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  return { res, body: await res.json() };
}

let runId: string;

describe('customer-events-export import + comparison + findings (T-1-09)', () => {
  it('applies the data-mapping fixture first so events/properties exist to resolve against', async () => {
    const preview = await postJson(`${baseUrl}/api/projects/${projectId}/import/data-mapping/preview`, dataMappingFixture);
    const applyRes = await postJson(`${baseUrl}/api/projects/${projectId}/import/data-mapping/apply`, {
      payload: dataMappingFixture,
      payload_hash: preview.body.payload_hash,
      selected_item_ids: preview.body.items.map((i: { id: string }) => i.id),
    });
    expect(applyRes.res.status).toBe(200);
  });

  it('preview returns per-type resolution and a payload_hash', async () => {
    const { res, body } = await postJson(
      `${baseUrl}/api/projects/${projectId}/import/customer-events-export/preview`,
      eventsFixture
    );
    expect(res.status).toBe(200);
    expect(body.items.length).toBe(19);
    expect(typeof body.payload_hash).toBe('string');
  });

  it('apply creates a QaRun, Observations, and runs comparison', async () => {
    const preview = await postJson(`${baseUrl}/api/projects/${projectId}/import/customer-events-export/preview`, eventsFixture);
    const applyRes = await postJson(`${baseUrl}/api/projects/${projectId}/import/customer-events-export/apply`, {
      payload: eventsFixture,
      payload_hash: preview.body.payload_hash,
      selected_item_ids: preview.body.items.map((i: { id: string }) => i.id),
    });
    expect(applyRes.res.status).toBe(200);
    expect(applyRes.body.inserted).toBe(19);
    expect(applyRes.body.run.kind).toBe('export_paste');
    runId = applyRes.body.run.id;
  });

  it('GET /qa-runs lists the created run', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/qa-runs`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.some((r: { id: string }) => r.id === runId)).toBe(true);
  });

  it('GET /qa-runs/:id returns the run with its observations', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/qa-runs/${runId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.observations.length).toBe(19);
  });

  it('GET /export/qa-runs/:runId/customer-events-export.json re-emits the run in the Bloomreach shape (T-2-11)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/export/qa-runs/${runId}/customer-events-export.json`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.customer_id).toBe(eventsFixture.customer_id);
    expect(body.events).toHaveLength(19);
    expect(body.events[0].timestamp).toBeGreaterThanOrEqual(body.events[body.events.length - 1].timestamp);
  });

  it('PATCH /qa-runs/:id archives the run', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/qa-runs/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: true }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.archived).toBe(true);
    // Unarchive again so later tests still see this run's observations in scope.
    await fetch(`${baseUrl}/api/projects/${projectId}/qa-runs/${runId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ archived: false }),
    });
  });

  it('POST /qa-runs/:id/finish sets finished_at', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/qa-runs/${runId}/finish`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: 'done' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.finished_at).toBeTruthy();
  });

  it('GET /observations filters by qa_run_id', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/observations?qa_run_id=${runId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(19);
  });

  it('POST /comparison/run recomputes and returns an open-severity summary', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/comparison/run`, { method: 'POST' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(typeof body.open.error).toBe('number');
  });

  it('GET /findings lists findings and supports filters', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/findings?status=open`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);

    const kindRes = await fetch(`${baseUrl}/api/projects/${projectId}/findings?kind=unexpected_event`);
    const kindBody = await kindRes.json();
    expect(kindBody.every((f: { kind: string }) => f.kind === 'unexpected_event')).toBe(true);
  });

  it('GET /findings?qa_run_id=<the applied run> is non-empty (fix round ERROR 2: the Import page apply/QaRuns "View findings for this run" landing must not show an empty table)', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/findings?qa_run_id=${runId}`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
    expect(body.every((f: { qa_run_id: string | null }) => f.qa_run_id === runId)).toBe(true);

    // Project-level kinds (missing_event, shape_inconsistent) are never attributable to a single
    // run and must stay excluded from the run filter (`qa_run_id: null` on those rows).
    expect(body.every((f: { kind: string }) => f.kind !== 'shape_inconsistent' && f.kind !== 'missing_event')).toBe(true);
  });
});

// D-52, T-3-07: PATCH/DELETE /observations/:id, DELETE /qa-runs/:id, each followed by runComparison.
describe('PATCH/DELETE /observations/:id and DELETE /qa-runs/:id (D-52, T-3-07)', () => {
  it('PATCH /observations/:id edits properties and recomputes raw_hash', async () => {
    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/observations?qa_run_id=${runId}`);
    const list = await listRes.json();
    const cartUpdate = list.find((o: { event_type: string }) => o.event_type === 'cart_update');
    expect(cartUpdate).toBeTruthy();
    const originalHash = cartUpdate.raw_hash;

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/observations/${cartUpdate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { ...cartUpdate.properties_json, total_price: 28 } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.properties_json.total_price).toBe(28);
    expect(body.raw_hash).not.toBe(originalHash);
  });

  it('PATCH /observations/:id returns 409 DUPLICATE_OBSERVATION when the edit collides with another observation of the same run', async () => {
    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/observations?qa_run_id=${runId}`);
    const list = await listRes.json();
    const viewCategories = list.filter((o: { event_type: string }) => o.event_type === 'view_category');
    expect(viewCategories.length).toBe(2); // fixture has two distinct view_category rows

    const [a, b] = viewCategories;
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/observations/${a.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: b.properties_json, timestamp: b.timestamp }),
    });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.code).toBe('DUPLICATE_OBSERVATION');
  });

  it('PATCH /observations/:id returns 400 VALIDATION_ERROR for malformed fields instead of 500ing (fix round WARNING 2)', async () => {
    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/observations?qa_run_id=${runId}`);
    const list = await listRes.json();
    const cartUpdate = list.find((o: { event_type: string }) => o.event_type === 'cart_update');
    expect(cartUpdate).toBeTruthy();

    const cases: Record<string, unknown>[] = [
      { properties: 'str' },
      { properties: [1, 2] },
      { timestamp: 'abc' },
      { timestamp: null },
      { page_url: 123 },
      { context_values_json: 'nope' },
    ];
    for (const body of cases) {
      const res = await fetch(`${baseUrl}/api/projects/${projectId}/observations/${cartUpdate.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.code).toBe('VALIDATION_ERROR');
    }

    // The observation itself is untouched by any of the rejected attempts.
    const afterRes = await fetch(`${baseUrl}/api/projects/${projectId}/observations?qa_run_id=${runId}`);
    const after = await afterRes.json();
    const stillThere = after.find((o: { id: string }) => o.id === cartUpdate.id);
    expect(stillThere.timestamp).toBe(cartUpdate.timestamp);
    expect(stillThere.properties_json).toEqual(cartUpdate.properties_json);
  });

  it('PATCH /observations/:id returns the re-resolved observation, not the stale pre-recompute one (fix round LOW 3)', async () => {
    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/observations?qa_run_id=${runId}`);
    const list = await listRes.json();
    const cartUpdate = list.find((o: { event_type: string }) => o.event_type === 'cart_update');
    expect(cartUpdate).toBeTruthy();
    expect(cartUpdate.variant_id).toBeTruthy(); // fixture's cart_update is action=add, a mapped variant

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/observations/${cartUpdate.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { ...cartUpdate.properties_json, action: 'remove' } }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    // action=remove has no mapped variant on the fixture -- the response must reflect the
    // post-recompute resolution (variant_id null), not the pre-recompute add=action variant.
    expect(body.variant_id).toBeNull();
  });

  it('DELETE /observations/:id removes the observation and recomputes findings', async () => {
    const listRes = await fetch(`${baseUrl}/api/projects/${projectId}/observations?qa_run_id=${runId}`);
    const list = await listRes.json();
    const supportTicket = list.find((o: { event_type: string }) => o.event_type === 'support_ticket');
    expect(supportTicket).toBeTruthy();

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/observations/${supportTicket.id}`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const afterRes = await fetch(`${baseUrl}/api/projects/${projectId}/observations?qa_run_id=${runId}`);
    const after = await afterRes.json();
    expect(after.some((o: { id: string }) => o.id === supportTicket.id)).toBe(false);
  });

  it('DELETE /observations/:id returns 404 for an unknown id', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/observations/does-not-exist`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });

  it('DELETE /qa-runs/:id removes the run and cascades its observations, then recomputes findings (fix round ERROR 1: findings.qa_run_id is ON DELETE CASCADE, not SET NULL -- the finding rows must survive, not be deleted with the run)', async () => {
    const beforeFindingsRes = await fetch(`${baseUrl}/api/projects/${projectId}/findings?qa_run_id=${runId}`);
    const beforeFindings = await beforeFindingsRes.json();
    expect(beforeFindings.length).toBeGreaterThan(0);
    const stampedIds: string[] = beforeFindings.map((f: { id: string }) => f.id);

    const res = await fetch(`${baseUrl}/api/projects/${projectId}/qa-runs/${runId}`, { method: 'DELETE' });
    expect(res.status).toBe(204);

    const runRes = await fetch(`${baseUrl}/api/projects/${projectId}/qa-runs/${runId}`);
    expect(runRes.status).toBe(404);

    const obsRes = await fetch(`${baseUrl}/api/projects/${projectId}/observations?qa_run_id=${runId}`);
    const obs = await obsRes.json();
    expect(obs).toHaveLength(0);

    // No lingering row still points at the deleted run...
    const afterFindingsRes = await fetch(`${baseUrl}/api/projects/${projectId}/findings?qa_run_id=${runId}`);
    const afterFindings = await afterFindingsRes.json();
    expect(afterFindings).toHaveLength(0);

    // ...because deleteQaRun already recomputed and every finding that no longer reproduces (its
    // only evidence was this run's observations) resolved -- it must NOT have been deleted outright
    // by the findings.qa_run_id ON DELETE CASCADE FK (0008_findings_on_delete.sql). Every id that
    // was stamped with this run before delete must still exist afterwards.
    for (const id of stampedIds) {
      const findingRes = await fetch(`${baseUrl}/api/projects/${projectId}/findings/${id}`);
      expect(findingRes.status).toBe(200);
      const finding = await findingRes.json();
      expect(finding.qa_run_id).toBeNull();
    }
  });

  it('DELETE /qa-runs/:id returns 404 for an unknown id', async () => {
    const res = await fetch(`${baseUrl}/api/projects/${projectId}/qa-runs/does-not-exist`, { method: 'DELETE' });
    expect(res.status).toBe(404);
  });
});

/**
 * Cross-task guard (T-5-43 x T-5-45, D-88): listed people's emails are written to the project's
 * change_log (`share_members` diff lines on `entity_type: 'project'` rows), and the public
 * `GET /api/shared/:token/history` reads change_log. No public history request -- project-wide or
 * for any target, including one naming the project id itself -- may ever return those emails.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createApp } from '../../app';
import { closeDb, getDb } from '../../db';
import { createClient } from '../../dal/client.dal';
import * as ProjectDAL from '../../dal/project.dal';
import { createIdentityRule, updateIdentityRule } from '../../dal/identity-rule.dal';
import { createCatalog, createCatalogField, updateCatalog } from '../../dal/catalog.dal';
import { createEvent } from '../../dal/event.dal';

const MEMBERS = ['Anna.Client@Example.com', 'viewer.person@client.example', 'removed.member@client.example'];
const EMAIL_PATTERN = /anna\.client|viewer\.person|removed\.member|@client\.example|@example\.com/i;

let server: http.Server;
let base: string;
let token: string;
let projectId: string;
const ids: Record<string, string> = {};

async function history(query = ''): Promise<{ status: number; body: string }> {
  const res = await fetch(`${base}/api/shared/${token}/history${query}`);
  return { status: res.status, body: await res.text() };
}

beforeAll(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = createClient({ key: 'privacy-co', name: 'Privacy Co' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'privacy-eu', name: 'Privacy EU' }).id;
  ids.event = createEvent(projectId, { name: 'privacy_check', class: 'custom' }).id;
  ids.rule = createIdentityRule(projectId, { name: 'Identify email', identifier_name: 'email', identity_type: 'hard' }).id;
  ids.catalog = createCatalog(projectId, { name: 'Products' }).id;
  ids.field = createCatalogField(projectId, ids.catalog, { name: 'sku' } as never).id;
  // Public changes, so every history form has rows to return.
  updateIdentityRule(projectId, ids.rule, { name: 'Identify email address' } as never);
  updateCatalog(projectId, ids.catalog, { description: 'All products' } as never);

  // Anyone-with-link, so the history routes answer without sign-in; the member list (and the
  // change_log rows carrying the emails) exists regardless of the audience setting.
  token = ProjectDAL.createOrRotateShare(projectId, 'comment').share_token!;
  for (const email of MEMBERS) ProjectDAL.addShareMember(projectId, { email, role: 'viewer' }, 'staff@e3-services.com');
  const removed = ProjectDAL.listShareMembers(projectId).find((m) => m.email === 'removed.member@client.example')!;
  ProjectDAL.updateShareMemberRole(projectId, ProjectDAL.listShareMembers(projectId)[0].id, 'commenter');
  ProjectDAL.removeShareMember(projectId, removed.id);

  server = http.createServer(createApp({ serveStatic: false }));
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('listed people emails never reach the public history', () => {
  it('the fixture really stored the emails in change_log (otherwise the checks below prove nothing)', () => {
    const rows = getDb()
      .prepare("SELECT diff_json FROM change_log WHERE project_id = ? AND diff_json LIKE '%share_members%'")
      .all(projectId) as { diff_json: string }[];
    expect(rows.length).toBeGreaterThanOrEqual(MEMBERS.length);
    expect(rows.map((r) => r.diff_json).join(' ')).toMatch(EMAIL_PATTERN);
  });

  it('project-wide history (all pages) returns public rows and no member email', async () => {
    let before = '';
    let pages = 0;
    let rowsSeen = 0;
    do {
      const res = await history(`?limit=100${before ? `&before=${before}` : ''}`);
      expect(res.status).toBe(200);
      expect(res.body).not.toMatch(EMAIL_PATTERN);
      expect(res.body).not.toContain('share_members');
      const data = JSON.parse(res.body) as { rows: unknown[]; next_cursor: string | null };
      rowsSeen += data.rows.length;
      before = data.next_cursor ?? '';
    } while (before && ++pages < 20);
    expect(rowsSeen).toBeGreaterThan(0); // the feed works, so the absence above is meaningful
  });

  it('per-target history for every public target returns no member email', async () => {
    const targets: [string, string][] = [
      ['event', ids.event],
      ['identity_rule', ids.rule],
      ['catalog', ids.catalog],
      ['catalog_field', ids.field],
    ];
    for (const [type, id] of targets) {
      const res = await history(`?entity_type=${type}&entity_id=${id}&limit=100`);
      expect(res.body).not.toMatch(EMAIL_PATTERN);
      expect(res.body).not.toContain('share_members');
    }
  });

  it('a target naming the project itself, under any entity type, returns no member email', async () => {
    for (const type of ['project', 'event', 'property', 'property_definition', 'identity_rule', 'catalog', 'catalog_field', 'use_case', 'requirement', 'consent_category']) {
      const res = await history(`?entity_type=${type}&entity_id=${projectId}&limit=100`);
      expect([200, 404]).toContain(res.status);
      expect(res.body).not.toMatch(EMAIL_PATTERN);
      expect(res.body).not.toContain('share_members');
    }
  });

  it('finding and QA report history routes return no member email either', async () => {
    for (const path of [`/findings/${projectId}/history`, '/qa-reports']) {
      const res = await fetch(`${base}/api/shared/${token}${path}`);
      expect(await res.text()).not.toMatch(EMAIL_PATTERN);
    }
  });
});

/**
 * D-49/T-4-02: comments are excluded from the tracking document and the documentation HTML
 * export (and, by extension, MCP -- both `get_event_card`/`get_tracking_document` read
 * `document.service.ts`, which this test already exercises). Plants a comment carrying a
 * deliberately identifiable secret body and asserts it never appears in either export's output.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import * as EventDAL from '../dal/event.dal';
import * as CommentDAL from '../dal/comment.dal';
import { buildTrackingDocument, buildEventCard } from './document.service';
import { generateProjectDocumentationHtml } from './export.service';

const SECRET = 'SECRET-CLIENT-ONLY-COMMENT-4f19b2';

let projectId: string;
let eventId: string;

beforeEach(async () => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  eventId = EventDAL.createEvent(projectId, { name: 'cart_update', class: 'custom' }).id;
  CommentDAL.createComment(projectId, {
    entity_type: 'event',
    entity_id: eventId,
    author_name: 'Client reviewer',
    body: SECRET,
  });
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

describe('comments are excluded from every export', () => {
  it('does not appear in buildTrackingDocument', () => {
    const doc = buildTrackingDocument(projectId);
    expect(JSON.stringify(doc)).not.toContain(SECRET);
  });

  it('does not appear in buildEventCard', () => {
    const card = buildEventCard(projectId, eventId);
    expect(JSON.stringify(card)).not.toContain(SECRET);
  });

  it('does not appear in the documentation HTML export', async () => {
    const html = await generateProjectDocumentationHtml(projectId);
    expect(html).not.toContain(SECRET);
  });
});

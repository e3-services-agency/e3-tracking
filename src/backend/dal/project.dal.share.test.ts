/**
 * `Project` share-link DAL tests (D-48, T-4-01): `createOrRotateShare`/`updateShareAccess`/
 * `revokeShare`/`getProjectByShareToken`, token shape, history-row token exclusion (D-44).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { closeDb } from '../db';
import * as ClientDAL from './client.dal';
import * as ProjectDAL from './project.dal';
import * as ChangeLogDAL from './change-log.dal';
import { ValidationError, NotFoundError } from '../errors';

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

describe('project.dal: share links (D-48, T-4-01)', () => {
  it('has no share link on create', () => {
    const project = ProjectDAL.getProjectOrThrow(projectId);
    expect(project.share_token).toBeNull();
    expect(project.share_access).toBeNull();
    expect(project.share_created_at).toBeNull();
  });

  it('createOrRotateShare generates a 32-byte base64url token (43 chars, url-safe charset)', () => {
    const project = ProjectDAL.createOrRotateShare(projectId, 'read');
    expect(project.share_token).toBeTruthy();
    expect(project.share_token).toHaveLength(43);
    expect(project.share_token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(project.share_access).toBe('read');
    expect(project.share_created_at).toBeTruthy();
  });

  it('rejects an invalid access level', () => {
    expect(() => ProjectDAL.createOrRotateShare(projectId, 'write')).toThrow(ValidationError);
  });

  // Fix round WARNING 1 (reviewer, 2026-09-28 18:14): the DAL is the enforcement point that keeps
  // the route honest -- a non-string access must reject before any rotation happens, not silently
  // default to 'read'.
  it('rejects a non-string access without rotating (number, null, array, object)', () => {
    const before = ProjectDAL.createOrRotateShare(projectId, 'read');
    for (const bad of [123, null, ['comment'], {}]) {
      expect(() => ProjectDAL.createOrRotateShare(projectId, bad)).toThrow(ValidationError);
    }
    expect(ProjectDAL.getProjectOrThrow(projectId).share_token).toBe(before.share_token);

    for (const bad of [123, null, ['comment'], {}]) {
      expect(() => ProjectDAL.updateShareAccess(projectId, bad)).toThrow(ValidationError);
    }
  });

  it('rotating replaces the token so the old one 404s (no longer resolves)', () => {
    const first = ProjectDAL.createOrRotateShare(projectId, 'read');
    const second = ProjectDAL.createOrRotateShare(projectId, 'read');
    expect(second.share_token).not.toBe(first.share_token);
    expect(ProjectDAL.getProjectByShareToken(first.share_token!)).toBeNull();
    expect(ProjectDAL.getProjectByShareToken(second.share_token!)?.id).toBe(projectId);
  });

  it('updateShareAccess changes access without rotating the token', () => {
    const created = ProjectDAL.createOrRotateShare(projectId, 'read');
    const updated = ProjectDAL.updateShareAccess(projectId, 'comment');
    expect(updated.share_token).toBe(created.share_token);
    expect(updated.share_access).toBe('comment');
  });

  it('updateShareAccess throws when there is no active share link', () => {
    expect(() => ProjectDAL.updateShareAccess(projectId, 'read')).toThrow(NotFoundError);
  });

  it('revokeShare clears the token, access and created-at so the old link 404s', () => {
    const created = ProjectDAL.createOrRotateShare(projectId, 'read');
    const revoked = ProjectDAL.revokeShare(projectId);
    expect(revoked.share_token).toBeNull();
    expect(revoked.share_access).toBeNull();
    expect(revoked.share_created_at).toBeNull();
    expect(ProjectDAL.getProjectByShareToken(created.share_token!)).toBeNull();
  });

  it('getProjectByShareToken returns null for a soft-deleted project', () => {
    const created = ProjectDAL.createOrRotateShare(projectId, 'read');
    ProjectDAL.softDeleteProject(projectId);
    expect(ProjectDAL.getProjectByShareToken(created.share_token!)).toBeNull();
  });

  it('getProjectByShareToken returns null for an unknown/empty token', () => {
    expect(ProjectDAL.getProjectByShareToken('not-a-real-token')).toBeNull();
    expect(ProjectDAL.getProjectByShareToken('')).toBeNull();
  });

  it('logs share create/rotate/revoke as project updates with the token excluded from the diff (D-44)', () => {
    ProjectDAL.createOrRotateShare(projectId, 'read');
    ProjectDAL.createOrRotateShare(projectId, 'comment');
    ProjectDAL.revokeShare(projectId);
    const rows = ChangeLogDAL.listChanges(projectId, { entity_type: 'project' });
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      for (const entry of row.diff_json) {
        expect(entry.field).not.toBe('share_token');
        const beforeStr = JSON.stringify(entry.before ?? '');
        const afterStr = JSON.stringify(entry.after ?? '');
        expect(beforeStr).not.toContain('share_token');
        expect(afterStr).not.toContain('share_token');
      }
    }
  });
});

/**
 * `requireShare` unit tests (D-48, T-4-01): token lookup + timing-safe compare, sets
 * `req.projectId`/`req.shareAccess`, 404 `SHARE_NOT_FOUND` for unknown/revoked, and never reads
 * `req.userId`/`req.userName` (the plan's own acceptance test: call it with the user fields
 * deleted/absent and confirm it still works exactly the same).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { closeDb } from '../db';
import * as ClientDAL from '../dal/client.dal';
import * as ProjectDAL from '../dal/project.dal';
import { requireShare } from './share';

let projectId: string;
let token: string;

beforeEach(() => {
  process.env.E3_DB_PATH = ':memory:';
  closeDb();
  const client = ClientDAL.createClient({ key: 'acme', name: 'Acme' });
  projectId = ProjectDAL.createProject({ client_id: client.id, key: 'acme-eu', name: 'Acme EU' }).id;
  const project = ProjectDAL.createOrRotateShare(projectId, 'read');
  token = project.share_token!;
});

afterEach(() => {
  closeDb();
  delete process.env.E3_DB_PATH;
});

function mockReqRes(params: Record<string, string>) {
  // Deliberately no `userId`/`userName` keys at all (not just undefined) -- proves requireShare
  // never touches them, matching how a real request to /api/shared/* arrives (mounted ahead of
  // optionalAuth in app.ts).
  const req = { params } as unknown as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('requireShare middleware (D-48, T-4-01)', () => {
  it('sets req.projectId/req.shareAccess and calls next for a valid token', () => {
    const { req, res, next } = mockReqRes({ token });
    requireShare(req, res, next);
    expect(req.projectId).toBe(projectId);
    expect(req.shareAccess).toBe('read');
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it('never reads req.userId/req.userName (absent on the request object)', () => {
    const { req, res, next } = mockReqRes({ token });
    expect('userId' in req).toBe(false);
    expect('userName' in req).toBe(false);
    requireShare(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect('userId' in req).toBe(false);
    expect('userName' in req).toBe(false);
  });

  it('404s SHARE_NOT_FOUND for an unknown token', () => {
    const { req, res, next } = mockReqRes({ token: 'not-a-real-token' });
    requireShare(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ code: 'SHARE_NOT_FOUND' }));
    expect(next).not.toHaveBeenCalled();
  });

  it('404s SHARE_NOT_FOUND once revoked', () => {
    ProjectDAL.revokeShare(projectId);
    const { req, res, next } = mockReqRes({ token });
    requireShare(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('404s SHARE_NOT_FOUND for a missing token param', () => {
    const { req, res, next } = mockReqRes({});
    requireShare(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });

  it('404s SHARE_NOT_FOUND for a same-length wrong token (defends the timing-safe compare path, not just the DB lookup)', () => {
    const wrong = token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A');
    const { req, res, next } = mockReqRes({ token: wrong });
    requireShare(req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(next).not.toHaveBeenCalled();
  });
});

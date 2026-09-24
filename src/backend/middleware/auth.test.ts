import { describe, expect, it, vi } from 'vitest';
import type { Request, Response, NextFunction } from 'express';
import { LOCAL_USER_ID, optionalAuth, requireAuth } from './auth';

function mockReqRes() {
  const req = {} as Request;
  const res = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  } as unknown as Response;
  const next = vi.fn() as NextFunction;
  return { req, res, next };
}

describe('auth middleware (local provider, D-13)', () => {
  it('sets req.userId to the local user and calls next', () => {
    const { req, res, next } = mockReqRes();
    optionalAuth(req, res, next);
    expect(req.userId).toBe(LOCAL_USER_ID);
    expect(req.userName).toBeTruthy();
    expect(next).toHaveBeenCalledOnce();
  });

  it('requireAuth passes through once optionalAuth has run', () => {
    const { req, res, next } = mockReqRes();
    optionalAuth(req, res, next);
    const { res: res2, next: next2 } = mockReqRes();
    requireAuth(req, res2, next2);
    expect(next2).toHaveBeenCalledOnce();
    expect(res2.status).not.toHaveBeenCalled();
  });

  it('requireAuth rejects when no user id is set (e.g. a future remote provider with no token)', () => {
    const req = {} as Request;
    const { res, next } = mockReqRes();
    requireAuth(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});

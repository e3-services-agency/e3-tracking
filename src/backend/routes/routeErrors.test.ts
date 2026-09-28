/**
 * `handleRouteError` mapping tests. W3 fix round (T-4-09 review): `ConfigError` (thrown by
 * `sandbox.service.ts` on a missing/corrupt bundled backup) must map to 500 with its own
 * `CONFIG_ERROR` code and message, distinguishable from the generic 500 `INTERNAL_ERROR` fallback,
 * and must never leak a stack trace.
 */
import { describe, expect, it, vi } from 'vitest';
import type { Response } from 'express';
import { handleRouteError } from './routeErrors';
import { ConfigError } from '../errors';

function mockResponse(): Response {
  const res: Partial<Response> = {};
  res.status = vi.fn().mockReturnValue(res);
  res.json = vi.fn().mockReturnValue(res);
  return res as Response;
}

describe('handleRouteError: ConfigError (W3 fix round)', () => {
  it('maps to 500 with code CONFIG_ERROR and the message, no stack', () => {
    const res = mockResponse();
    handleRouteError(new ConfigError('The bundled sandbox backup is missing.'), res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body).toEqual({ error: 'The bundled sandbox backup is missing.', code: 'CONFIG_ERROR' });
    expect(body.stack).toBeUndefined();
  });

  it('is distinguishable from the generic 500 fallback for a plain Error', () => {
    const res = mockResponse();
    handleRouteError(new Error('boom'), res);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(body.code).toBe('INTERNAL_ERROR');
    expect(body.code).not.toBe('CONFIG_ERROR');
  });
});

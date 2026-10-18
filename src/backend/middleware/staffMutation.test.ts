import { afterEach, expect, it, vi } from 'vitest';
import type { Request, Response } from 'express';
import { requireStaffMutation } from './staffMutation';
afterEach(() => vi.unstubAllEnvs());
function check(extra: Partial<Request> = {}) {
    const next = vi.fn(), status = vi.fn().mockReturnThis(), json = vi.fn();
    requireStaffMutation({ userId: 'verified', userName: 'Verified staff', protocol: 'http', headers: { host: '127.0.0.1:3017', origin: 'http://127.0.0.1:3017' }, ...extra } as Request, {status,json} as unknown as Response, next);
    return { next, status };
}
it('accepts local exact same-origin staff and rejects missing identity or Origin', () => {
    vi.stubEnv('AUTH_MODE', 'local');
    expect(check().next).toHaveBeenCalledOnce();
    expect(check({ userId: undefined }).status).toHaveBeenCalledWith(401);
    for (const origin of [undefined, 'null', 'https://evil.example', 'http://localhost:3017'])
        expect(check({headers:{host:'127.0.0.1:3017',origin}}).status).toHaveBeenCalledWith(403);
});
it('normalizes proxy mode but requires canonical configured origin and host', () => {
    vi.stubEnv('AUTH_MODE', ' PrOxY '); vi.stubEnv('E3_PUBLIC_ORIGIN', 'https://tracking.example.com');
    expect(check({headers:{host:'tracking.example.com',origin:'https://tracking.example.com'}}).next).toHaveBeenCalledOnce();
    expect(check().status).toHaveBeenCalledWith(403);
    vi.stubEnv('E3_PUBLIC_ORIGIN', 'invalid');
    expect(check().status).toHaveBeenCalledWith(403);
    vi.stubEnv('E3_PUBLIC_ORIGIN', 'https://tracking.example.com/');
    expect(check({headers:{host:'tracking.example.com',origin:'https://tracking.example.com/'}}).status).toHaveBeenCalledWith(403);
});

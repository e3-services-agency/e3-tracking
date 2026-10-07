/**
 * Auth middleware (D-13): a `provider` switch so a future remote provider can be added without
 * touching routes. `AUTH_MODE` selects the provider; default and only implemented provider today
 * is `local` (D-09: no remote dependency to verify the app).
 *
 * - `local` provider: every request is user `local-user`, admin on every project. The display
 *   name (`req.userName`, used for QA run `actor` and future change history) resolves once at
 *   process startup, in order (D-25 Q8): `E3_LOCAL_USER_NAME` env, else `git config user.name`
 *   (read synchronously once, cached), else the literal "Local user".
 * - A future `remote` provider would verify a bearer token (e.g. against a hosted auth service)
 *   and set `req.userId`/`req.userName` from the verified session; `requireAuth` and the
 *   `requireProject` membership check already treat "no req.userId" as unauthenticated, so adding
 *   it is additive here, not a route change.
 */
import type { Request, Response, NextFunction } from 'express';
import { execFileSync } from 'node:child_process';
import { BlockList, isIP } from 'node:net';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userName?: string;
    }
  }
}

type AuthProvider = 'local' | 'proxy' | 'remote';

function getAuthProvider(): AuthProvider {
  const raw = (process.env.AUTH_MODE ?? 'local').trim().toLowerCase();
  return raw === 'remote' ? 'remote' : raw === 'proxy' ? 'proxy' : 'local';
}

/** Reads `git config user.name` once, synchronously, at module load. Never throws. */
function readGitUserName(): string | null {
  try {
    const out = execFileSync('git', ['config', 'user.name'], {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 2000,
    }).trim();
    return out || null;
  } catch {
    return null;
  }
}

/** Resolved once at process startup (D-25 Q8): env override, else git user.name, else fallback. */
export const LOCAL_USER_NAME: string =
  process.env.E3_LOCAL_USER_NAME?.trim() || readGitUserName() || 'Local user';

export const LOCAL_USER_ID = 'local-user';

/**
 * Sets `req.userId`/`req.userName` for every request. In `local` mode this always succeeds (no
 * token, no network). A `remote` provider would verify a bearer token here and leave the fields
 * unset on failure, same as the current pass-through-on-missing-token behaviour.
 */
export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const provider = getAuthProvider();
  if (provider === 'local') {
    req.userId = LOCAL_USER_ID;
    req.userName = LOCAL_USER_NAME;
  } else if (provider === 'proxy') {
    applyProxyIdentity(req);
  }
  next();
}

/** Default trusted proxy network: the Docker bridge range (D-72 item 4). */
export const DEFAULT_TRUSTED_PROXY_CIDR = '172.16.0.0/12';

export function getTrustedProxyCidrs(): string[] {
  const raw = process.env.TRUSTED_PROXY_CIDR?.trim() || DEFAULT_TRUSTED_PROXY_CIDR;
  return raw.split(',').map((c) => c.trim()).filter(Boolean);
}

/** Startup guard: proxy mode in production must name its trusted network explicitly. */
export function assertAuthConfig(): void {
  if (getAuthProvider() === 'proxy') buildBlockList(getTrustedProxyCidrs()); // warns on invalid entries
  if (getAuthProvider() === 'proxy' && process.env.NODE_ENV === 'production' && !process.env.TRUSTED_PROXY_CIDR?.trim()) {
    throw new Error(
      'AUTH_MODE=proxy requires TRUSTED_PROXY_CIDR to be set explicitly in production (the network the reverse proxy connects from, e.g. 172.18.0.0/16).'
    );
  }
}

let cachedKey: string | null = null;
let cachedList: BlockList | null = null;

function buildBlockList(cidrs: string[]): BlockList {
  const key = cidrs.join(',');
  if (cachedList && cachedKey === key) return cachedList;
  const list = new BlockList();
  for (const c of cidrs) {
    const [addr, prefix] = c.split('/');
    if (!isIP(addr)) {
      console.warn(`[e3-tracking] ignoring invalid TRUSTED_PROXY_CIDR entry: ${c}`);
      continue;
    }
    const type = isIP(addr) === 6 ? 'ipv6' : 'ipv4';
    if (prefix === undefined) list.addAddress(addr, type);
    else list.addSubnet(addr, Number(prefix), type);
  }
  cachedKey = key;
  cachedList = list;
  return list;
}

/** True when the direct TCP peer is inside the trusted CIDR(s). X-Forwarded-For is never used for trust. */
export function isTrustedPeer(req: Request): boolean {
  let addr = req.socket?.remoteAddress;
  if (!addr) return false;
  if (addr.startsWith('::ffff:')) addr = addr.slice(7);
  if (!isIP(addr)) return false;
  return buildBlockList(getTrustedProxyCidrs()).check(addr, isIP(addr) === 6 ? 'ipv6' : 'ipv4');
}

function applyProxyIdentity(req: Request): void {
  if (!isTrustedPeer(req)) return;
  const v = req.headers['x-forwarded-email'];
  const email = (Array.isArray(v) ? v[0] : v)?.trim().toLowerCase();
  if (!email || !email.includes('@')) return;
  req.userId = email;
  // The email is the actor, so change_log and comments attribute to the signed-in person.
  req.userName = email;
}

/** Proxy mode: 401 on internal /api routes without a trusted identity. /api/health stays public. */
export function proxyGate(req: Request, res: Response, next: NextFunction): void {
  if (getAuthProvider() !== 'proxy' || req.userId || !req.path.startsWith('/api/') || req.path === '/api/health') {
    next();
    return;
  }
  res.status(401).json({ error: 'Authentication required.', code: 'UNAUTHENTICATED' });
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (req.userId) {
    next();
    return;
  }
  res.status(401).json({
    error: 'Authentication required.',
    code: 'UNAUTHENTICATED',
  });
}

/** True when `userId` is an admin of every project (local mode: always true for the local user, D-13). */
export function isLocalAdmin(userId: string | undefined): boolean {
  return getAuthProvider() === 'local' && userId === LOCAL_USER_ID;
}

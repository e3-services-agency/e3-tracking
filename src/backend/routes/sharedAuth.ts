/** Shared commenter authentication: identity only, never internal access or share authorization. */
import express, { type Request, type Response, type NextFunction } from 'express';
import { timingSafeEqual } from 'node:crypto';
import { OAuth2Client, type TokenPayload } from 'google-auth-library';
import { requireShare } from '../middleware/share';
import { authHash, createAuthChallenge, consumeAuthChallenge, createAuthSession, readAuthSession, deleteAuthSession } from '../dal/commentAuth.dal';

export interface TrustedCommentParticipant { id: string; name: string; avatar_url: string | null; verified: true; kind: 'google' | 'staff' }
type ParticipantRequest = Request & { commentParticipant?: TrustedCommentParticipant };
export type GoogleVerifier = (credential: string, audience: string) => Promise<TokenPayload>;
export interface SharedAuthOptions { verifyGoogle?: GoogleVerifier; staffFetch?: typeof fetch; verifyStaff?: GoogleVerifier }
const SESSION_COOKIE = 'e3_comment_auth';
const CHALLENGE_COOKIE = 'e3_comment_challenge';
const SIGNED_OUT_COOKIE = 'e3_comment_signed_out';
const oauthClient = new OAuth2Client();
const defaultVerifier: GoogleVerifier = async (credential, audience) => {
  const ticket = await oauthClient.verifyIdToken({ idToken: credential, audience });
  const payload = ticket.getPayload();
  if (!payload) throw new Error('Invalid Google identity.');
  return payload;
};

export function cookieValue(req: Request, name: string): string | undefined {
  const values = (req.headers.cookie ?? '').split(';').map((c) => c.trim()).filter((c) => c.startsWith(`${name}=`));
  if (values.length !== 1) return undefined;
  try { return decodeURIComponent(values[0].slice(name.length + 1)); } catch { return undefined; }
}
function cookieOptions(maxAge: number) {
  return { httpOnly: true, sameSite: 'lax' as const, secure: process.env.NODE_ENV === 'production', path: '/', maxAge };
}
function publicOrigin(): string | null {
  try {
    const raw = process.env.E3_PUBLIC_ORIGIN?.trim();
    if (!raw) return null;
    const url = new URL(raw);
    if (url.origin !== raw || url.username || url.password) return null;
    if (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}
function equal(a: string | undefined, b: unknown): boolean {
  if (!a || typeof b !== 'string' || a.length !== b.length || a.length > 256) return false;
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
export function safeProfilePhoto(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && /^lh[0-9]+\.googleusercontent\.com$/.test(url.hostname) ? url.href : null;
  } catch { return null; }
}
function privateResponse(res: Response): void { res.set('Cache-Control', 'no-store'); res.set('Pragma', 'no-cache'); }
function reject(res: Response, status: number, code: string, error: string): void { privateResponse(res); res.status(status).json({ error, code }); }
function originAllowed(req: Request): boolean { return Boolean(publicOrigin() && req.headers.origin === publicOrigin()); }
function csrfAllowed(req: Request): boolean { return originAllowed(req) && equal(cookieValue(req, CHALLENGE_COOKIE), req.body?.csrf_token); }

const STAFF_PROFILE_URL = 'https://www.googleapis.com/oauth2/v2/userinfo?fields=id,email,verified_email,hd,picture';
const MAX_PROFILE_BYTES = 8192;
/** Profile tokens only travel server-to-server to this fixed Google endpoint. */
async function staffProfilePhoto(accessToken: string | null, payload: TokenPayload, email: string, domain: string, fetcher: typeof fetch): Promise<string | null> {
  if (!accessToken || !/^[A-Za-z0-9._~+/-]{1,8192}={0,2}$/.test(accessToken)) return null;
  try {
    const signal = AbortSignal.timeout(1500);
    const response = await fetcher(STAFF_PROFILE_URL, { headers: { Authorization: `Bearer ${accessToken}` }, redirect: 'error', signal });
    if (!response.ok || !response.body || !response.headers.get('content-type')?.toLowerCase().includes('application/json')) return null;
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        signal.throwIfAborted();
        const chunk = await reader.read();
        if (chunk.done) break;
        size += chunk.value.byteLength;
        if (size > MAX_PROFILE_BYTES) { await reader.cancel(); return null; }
        chunks.push(chunk.value);
      }
    } finally { reader.releaseLock(); }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const info = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as Record<string, unknown>;
    if (info.id !== payload.sub || info.email !== email || info.verified_email !== true || info.hd !== domain) return null;
    return safeProfilePhoto(info.picture);
  } catch { return null; }
}

/** Fixed destination; request headers cannot change the URL or supply verified identity. */
export async function resolveStaffIdentity(req: Request, fetcher: typeof fetch = fetch, verifyStaff: GoogleVerifier = defaultVerifier): Promise<TrustedCommentParticipant | undefined> {
  if ((process.env.AUTH_MODE ?? '').toLowerCase() !== 'proxy' || process.env.COMMENT_STAFF_SESSION !== '1') return undefined;
  const staffCookies = (req.headers.cookie ?? '').split(';').map((c) => c.trim()).filter((c) => /^_oauth2_proxy(?:_\d+)?=/.test(c));
  if (!staffCookies.length || staffCookies.join('; ').length > 16000) return undefined;
  try {
    const headers = { Cookie: staffCookies.join('; ') };
    const response = await fetcher('http://oauth2-proxy:4180/oauth2/auth', { headers, redirect: 'error', signal: AbortSignal.timeout(1500) });
    if (response.status !== 202) return undefined;
    const email = response.headers.get('x-auth-request-email')?.trim().toLowerCase();
    const domain = process.env.WORKSPACE_DOMAIN?.trim().toLowerCase();
    if (!email || !domain || email.split('@').length !== 2 || email.split('@')[1] !== domain) return undefined;
    let name = response.headers.get('x-auth-request-preferred-username')?.trim();
    let avatar: string | null = null;
    // Only the fixed authenticated proxy response can supply a token. Browser headers are ignored.
    const audience = process.env.GOOGLE_STAFF_CLIENT_ID?.trim();
    const bearer = response.headers.get('authorization');
    const credential = bearer?.match(/^Bearer ([A-Za-z0-9._-]{1,10000})$/)?.[1];
    if (audience && credential && (!req.userId || req.userId.toLowerCase() === email)) {
      try {
        const payload = await verifyStaff(credential, audience);
        if (payload.aud === audience && ['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss)
          && Number.isFinite(payload.exp) && payload.exp > Date.now() / 1000 && typeof payload.sub === 'string' && payload.sub
          && payload.email_verified === true && payload.email?.trim().toLowerCase() === email && payload.hd?.toLowerCase() === domain) {
          avatar = safeProfilePhoto(payload.picture);
          if (!avatar) avatar = await staffProfilePhoto(response.headers.get('x-auth-request-access-token'), payload, email, domain, fetcher);
        }
      } catch { /* Profile enrichment cannot change staff identity or prevent commenting. */ }
    }
    if (!name || name.includes('@')) name = email.split('@')[0];
    return { id: `staff:${authHash(email)}`, name: name.slice(0, 80), avatar_url: avatar, verified: true, kind: 'staff' };
  } catch { return undefined; }
}

/** Internal attribution remains the middleware identity; cookies only enrich its matching photo. */
export async function resolveInternalStaffPhoto(req: Request, fetcher: typeof fetch = fetch, verifyStaff: GoogleVerifier = defaultVerifier): Promise<string | null> {
  if (!req.userId) return null;
  return (await resolveStaffIdentity(req, fetcher, verifyStaff))?.avatar_url ?? null;
}

export function createSharedAuthRouter(options: SharedAuthOptions = {}): express.Router {
  const router = express.Router();
  router.use((_req, res, next) => { privateResponse(res); next(); });
  const verifyGoogle = options.verifyGoogle ?? defaultVerifier;
  // requireShare validates revoked/read-only tokens independently of identity. No local admin fallback.
  router.use('/:token', requireShare, (req: ParticipantRequest, res, next) => {
    void (async () => {
      const sessionToken = cookieValue(req, SESSION_COOKIE);
      const session = sessionToken ? readAuthSession(sessionToken) : undefined;
      if (session) req.commentParticipant = { id: session.participant_id, name: session.name, avatar_url: session.avatar_url, verified: true, kind: 'google' };
      else if (!req.commentParticipant && cookieValue(req, SIGNED_OUT_COOKIE) !== '1') req.commentParticipant = await resolveStaffIdentity(req, options.staffFetch, options.verifyStaff);
      // SameSite is supplementary: authenticated mutations additionally require exact application origin.
      if (req.commentParticipant && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !originAllowed(req)) {
        reject(res, 403, 'AUTH_ORIGIN', 'This action must come from the shared portal.'); return;
      }
      next();
    })().catch(next);
  });
  router.get('/:token/auth/config', (req: ParticipantRequest, res) => {
    privateResponse(res);
    if (req.headers.origin && !originAllowed(req)) { reject(res, 403, 'AUTH_ORIGIN', 'This action must come from the shared portal.'); return; }
    const clientId = process.env.GOOGLE_COMMENT_CLIENT_ID?.trim() ?? '';
    const configured = Boolean(clientId && publicOrigin());
    try {
      const challenge = configured || req.commentParticipant ? createAuthChallenge(req.params.token, cookieValue(req, CHALLENGE_COOKIE)) : undefined;
      if (challenge) res.cookie(CHALLENGE_COOKIE, challenge.token, cookieOptions(5 * 60 * 1000));
      const identity = req.commentParticipant ? { kind: req.commentParticipant.kind, name: req.commentParticipant.name, avatar_url: req.commentParticipant.avatar_url, verified: true } : null;
      res.json({ enabled: configured, client_id: configured ? clientId : null, csrf_token: challenge?.token ?? null, nonce: challenge?.nonce ?? null, identity, signed_out: cookieValue(req, SIGNED_OUT_COOKIE) === '1' });
    } catch { reject(res, 429, 'AUTH_BUSY', 'Authentication is busy. Try again shortly.'); }
  });
  router.post('/:token/auth/google', express.json({ limit: '12kb' }), async (req, res) => {
    privateResponse(res);
    const audience = process.env.GOOGLE_COMMENT_CLIENT_ID?.trim();
    if (!audience || !publicOrigin()) { reject(res, 503, 'GOOGLE_NOT_CONFIGURED', 'Google sign-in is not configured.'); return; }
    if (!csrfAllowed(req)) { reject(res, 403, 'AUTH_CSRF', 'Sign-in expired. Please try again.'); return; }
    const credential = req.body?.credential;
    if (typeof credential !== 'string' || !credential || credential.length > 10000) { reject(res, 400, 'INVALID_CREDENTIAL', 'Invalid Google credential.'); return; }
    const nonce = consumeAuthChallenge(cookieValue(req, CHALLENGE_COOKIE)!, req.params.token);
    if (!nonce) { reject(res, 403, 'AUTH_CSRF', 'Sign-in expired. Please try again.'); return; }
    try {
      const payload = await verifyGoogle(credential, audience);
      if (payload.aud !== audience || !['accounts.google.com', 'https://accounts.google.com'].includes(payload.iss) || !Number.isFinite(payload.exp) || payload.exp <= Date.now() / 1000 || typeof payload.sub !== 'string' || !payload.sub || !equal(nonce, (payload as TokenPayload & { nonce?: string }).nonce)) throw new Error('Invalid Google identity.');
      const name = payload.name?.trim().slice(0, 80) || 'Google user';
      const oldToken = cookieValue(req, SESSION_COOKIE);
      if (oldToken) deleteAuthSession(oldToken);
      const token = createAuthSession(payload.sub, name, safeProfilePhoto(payload.picture));
      res.cookie(SESSION_COOKIE, token, cookieOptions(24 * 60 * 60 * 1000));
      res.clearCookie(CHALLENGE_COOKIE, cookieOptions(0));
      res.clearCookie(SIGNED_OUT_COOKIE, cookieOptions(0));
      res.json({ ok: true });
    } catch { reject(res, 401, 'INVALID_GOOGLE_IDENTITY', 'Google sign-in could not be verified. Please try again.'); }
  });
  router.post('/:token/auth/logout', express.json({ limit: '2kb' }), (req, res) => {
    if (!csrfAllowed(req) || !consumeAuthChallenge(cookieValue(req, CHALLENGE_COOKIE)!, req.params.token)) { reject(res, 403, 'AUTH_CSRF', 'Sign-out expired. Please try again.'); return; }
    const token = cookieValue(req, SESSION_COOKIE);
    if (token) deleteAuthSession(token);
    res.clearCookie(SESSION_COOKIE, cookieOptions(0));
    res.clearCookie(CHALLENGE_COOKIE, cookieOptions(0));
    // Opt out of automatically borrowing the staff session; staff portal login is unaffected.
    res.cookie(SIGNED_OUT_COOKIE, '1', cookieOptions(24 * 60 * 60 * 1000));
    privateResponse(res);
    res.json({ ok: true });
  });
  // Match the existing public share router: malformed URI/JSON and unexpected errors reveal no paths.
  router.use((_err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    reject(res, 404, 'SHARE_NOT_FOUND', 'This share link is not valid.');
  });
  return router;
}

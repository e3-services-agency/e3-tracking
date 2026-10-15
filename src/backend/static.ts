/**
 * Production static serving (D-66, T-5-00): serves the Vite build (`dist/`) under `/tracking-plan/`
 * with an SPA fallback, from the same Express process as the API. Mounted by `createApp()` only
 * when `SERVE_STATIC=1` or `NODE_ENV=production` (and not on Vercel, where static files are served
 * by the platform, D-23), so `npm run dev` is unchanged.
 *
 * - `/tracking-plan/assets/*` (content-hashed by Vite): `Cache-Control: public, max-age=31536000, immutable`.
 * - `index.html` and every other file: `no-store`.
 * - Any other GET/HEAD under `/tracking-plan/` whose last segment has no file extension gets
 *   `index.html` (client-side routes, incl. `/tracking-plan/shared/:token`); a missing file with an
 *   extension is a plain 404. Every path under `/tracking-plan/shared/` is a client portal route
 *   (T-5-42, `/shared/:token/<view>/<id>`, where an event name or use case code may contain a dot),
 *   so it always gets `index.html`.
 * - A malformed percent-escape in the path is a plain-text 400, never a stack trace.
 * - Unknown `/api/*` paths are a JSON 404 (never the SPA).
 */
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const BASE_PATH = '/tracking-plan';

/** Default `dist/` location: `<repo or /app>/dist`, two levels above `src/backend` and `api/_backend`. */
export function defaultDistDir(): string {
  if (process.env.E3_DIST_PATH?.trim()) return path.resolve(process.env.E3_DIST_PATH.trim());
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '..', '..', 'dist');
}

export function shouldServeStatic(): boolean {
  if (process.env.SERVE_STATIC === '1') return true;
  return process.env.NODE_ENV === 'production' && !process.env.VERCEL;
}

function hasBadEscape(rawUrl: string): boolean {
  const p = rawUrl.split('?')[0];
  try {
    decodeURIComponent(p);
    return false;
  } catch {
    return true;
  }
}

/** Plain 400 for a malformed percent-escape on any non-share path (mounted early by `createApp`, never a 500). */
export function rejectBadEscape(req: express.Request, res: express.Response, next: express.NextFunction): void {
  if (hasBadEscape(req.originalUrl)) {
    if (req.originalUrl.startsWith('/api/')) {
      res.status(400).json({ error: 'Malformed URL.', code: 'INVALID_PATH' });
    } else {
      res.status(400).type('text/plain').send('Bad request: malformed URL.');
    }
    return;
  }
  next();
}

/** Rewrites `/tracking-plan/api/...` to `/api/...` (the same mapping the Vite dev proxy applies). */
export function rewriteBaseApi(req: express.Request, _res: express.Response, next: express.NextFunction): void {
  if (
    req.url === `${BASE_PATH}/api` ||
    req.url.startsWith(`${BASE_PATH}/api/`) ||
    req.url.startsWith(`${BASE_PATH}/api?`)
  ) {
    req.url = req.url.slice(BASE_PATH.length);
  }
  next();
}

export function mountStatic(app: express.Express, distDir: string): boolean {
  const indexFile = path.join(distDir, 'index.html');
  if (!fs.existsSync(indexFile)) {
    console.warn(`[e3-tracking] static serving requested but ${indexFile} does not exist; skipping`);
    return false;
  }

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });
  });

  app.get('/', (_req, res) => res.redirect(302, `${BASE_PATH}/`));

  app.use(
    BASE_PATH,
    express.static(distDir, {
      index: false,
      fallthrough: true,
      setHeaders: (res, filePath) => {
        const rel = path.relative(distDir, filePath).split(path.sep);
        res.setHeader('Cache-Control', rel[0] === 'assets' ? 'public, max-age=31536000, immutable' : 'no-store');
      },
    })
  );

  app.use(BASE_PATH, (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const last = req.path.split('/').filter(Boolean).pop() ?? '';
    if (last.includes('.') && !req.path.startsWith('/shared/')) {
      res.status(404).type('text/plain').send('Not found.');
      return;
    }
    res.setHeader('Cache-Control', 'no-store');
    res.type('html').send(fs.readFileSync(indexFile));
  });

  return true;
}

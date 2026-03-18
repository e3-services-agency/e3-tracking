import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from './_backend/app.js';

const app = createApp();
const SUB_PATH = '/tracking-plan';

/**
 * Vercel may pass the request with the original URL (e.g. /tracking-plan/api/events).
 * Express is mounted at /api/* so we normalize req.url to start with /api/ before handing to the app.
 */
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';
  const pathOnly = url.split('?')[0];
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  let path = pathOnly;
  if (path.startsWith(SUB_PATH)) {
    path = path.slice(SUB_PATH.length) || '/';
  }
  (req as IncomingMessage & { url: string }).url = path + query;
  app(req, res);
}

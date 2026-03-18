import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../../_backend/app.js';

const app = createApp();
const SUB_PATH = '/tracking-plan';

/**
 * Dedicated function for PUT /api/journeys/:id/qa
 * so Vercel reliably routes the deep method+path.
 */
export default function handler(req: IncomingMessage, res: ServerResponse): void {
  // Normalize /tracking-plan prefix (same logic as catch-all).
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


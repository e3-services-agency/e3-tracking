/**
 * Vercel Serverless entry: forwards all /api/* requests to the Express app.
 * Same-origin as the frontend → leave VITE_API_BASE_URL unset in Vercel.
 *
 * Vercel may pass the path without the /api prefix (e.g. /events). Express expects
 * routes at /api/events, so we normalize req.url to always start with /api.
 *
 * Required env in Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 * Optional: CORS_ORIGIN (comma-separated), GEMINI_API_KEY (for codegen).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../src/backend/app.ts';

const app = createApp();

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/';
  const pathOnly = url.split('?')[0];
  const query = url.includes('?') ? url.slice(url.indexOf('?')) : '';
  // Ensure Express sees /api/... so app.use('/api/events', ...) etc. match
  const expressPath = pathOnly.startsWith('/api') ? pathOnly : `/api${pathOnly.startsWith('/') ? pathOnly : '/' + pathOnly}`;
  (req as IncomingMessage & { url: string }).url = expressPath + query;
  app(req, res);
}

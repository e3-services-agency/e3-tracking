/**
 * Vercel Serverless entry: forwards all /api/* requests to the compiled Express app.
 * Build: run "npm run build" so dist-backend/backend/app.js exists (see package.json).
 *
 * Vercel may pass the path without the /api prefix; we normalize req.url to /api/...
 *
 * Required env in Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 * Optional: CORS_ORIGIN (comma-separated), GEMINI_API_KEY (for codegen).
 */
import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../dist-backend/backend/app.js';

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

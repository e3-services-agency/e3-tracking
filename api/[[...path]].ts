/**
 * Vercel Serverless entry: forwards all /api/* requests to the Express app.
 * Same-origin as the frontend → leave VITE_API_BASE_URL unset in Vercel.
 *
 * Required env in Vercel: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_ANON_KEY.
 * Optional: CORS_ORIGIN (comma-separated), GEMINI_API_KEY (for codegen).
 */
import { createApp } from '../src/backend/app.js';

const app = createApp();

export default function handler(
  req: import('http').IncomingMessage,
  res: import('http').ServerResponse
): void {
  app(req, res);
}

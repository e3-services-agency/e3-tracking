/**
 * Local dev/runtime entry point (D-23): starts the Express app from `createApp()` and opens
 * the SQLite database (migrations run on first `getDb()` call inside the DAL layer / routes).
 * Not used by the Vercel serverless build (`api/index.ts` stays untouched, D-23).
 *
 * Usage: `tsx watch src/backend/server.ts` (via `npm run dev:api`), port from `PORT` env,
 * default 3001.
 */
import { createApp } from './app';
import { getDb } from './db';

const PORT = Number(process.env.PORT) || 3001;

// Open the database and run pending migrations before accepting requests.
getDb();

const app = createApp();

app.listen(PORT, () => {
  console.log(`[e3-tracking] API listening on http://localhost:${PORT}`);
});

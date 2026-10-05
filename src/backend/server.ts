/**
 * Runtime entry point (D-23, D-66): starts the Express app from `createApp()` and opens the SQLite
 * database (migrations run on the `getDb()` call below). Not used by the Vercel serverless build
 * (`api/index.ts` stays untouched, D-23).
 *
 * Dev: `tsx watch src/backend/server.ts` (`npm run dev:api`). Production/container: `npm start`
 * (`node api/_backend/server.js`, the tsup bundle). `PORT` default 3001; `HOST` default 0.0.0.0 in
 * production and unset (dual-stack) in dev so the Vite proxy to `localhost` keeps working.
 */
import { createApp } from './app';
import { closeDb, getDb } from './db';

const PORT = Number(process.env.PORT) || 3001;
const HOST = process.env.HOST?.trim() || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : undefined);

// Open the database and run pending migrations before accepting requests.
getDb();

const app = createApp();

const onListening = (): void => {
  console.log(`[e3-tracking] API listening on http://${HOST ?? 'localhost'}:${PORT}`);
};
const server = HOST ? app.listen(PORT, HOST, onListening) : app.listen(PORT, onListening);

for (const sig of ['SIGTERM', 'SIGINT'] as const) {
  process.on(sig, () => {
    server.close(() => {
      closeDb(); // checkpoints and removes the WAL on a clean close
      process.exit(0);
    });
    setTimeout(() => process.exit(0), 5000).unref();
  });
}

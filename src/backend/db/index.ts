/**
 * Local SQLite persistence (D-09, D-12).
 *
 * `getDb()` returns a singleton `better-sqlite3` connection, applies pending migrations from
 * `src/backend/db/migrations/*.sql` (tracked in `schema_migrations`) and returns the same
 * connection on every call within a process. Path comes from `E3_DB_PATH`
 * (default `./data/e3-tracking.sqlite`); `:memory:` is supported for tests and never persists.
 *
 * This is the only module in the codebase that imports `better-sqlite3` directly (D-12): DAL
 * modules call `getDb()` and stay otherwise engine-agnostic so a later Postgres DAL is a swap,
 * not a rewrite.
 */
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, 'migrations');

let db: Database.Database | null = null;

/** Resolve the configured database path, creating the parent directory if needed. */
function resolveDbPath(): string {
  const configured = process.env.E3_DB_PATH?.trim() || './data/e3-tracking.sqlite';
  if (configured === ':memory:') return configured;
  const resolved = path.resolve(configured);
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  return resolved;
}

/**
 * Ordered list of `NNNN_*.sql` migration files in `migrations/`. Throws a clear startup error
 * instead of silently returning an empty list when the directory is missing or contains no
 * `.sql` files: `getDb()` must never hand out a connection with zero tables (reviewer warning
 * on src/backend/db/index.ts:34, T-1-01 follow-up). The built bundle ships its `.sql` files
 * next to `api/_backend/app.js` (see `tsup.config.ts`'s `onSuccess`), so this same relative
 * lookup works for both `tsx src/backend/server.ts` and the tsup bundle.
 */
export function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    throw new Error(
      `No migrations directory found at ${MIGRATIONS_DIR}. Expected .sql migration files ` +
        `next to this module (see tsup.config.ts onSuccess for the built-bundle copy step).`
    );
  }
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    throw new Error(`Migrations directory ${MIGRATIONS_DIR} contains no .sql files.`);
  }
  return files;
}

/**
 * Apply every migration file not yet recorded in `schema_migrations`, in filename order.
 * Creating the tracking table, reading the applied set and applying pending files all happen
 * inside a single `BEGIN IMMEDIATE` transaction, so two processes booting on an empty database
 * file at once (Express and the MCP sibling, D-19) cannot both observe "nothing applied" and
 * race to create the same tables; the second acquires the write lock only after the first has
 * committed and sees its migrations already recorded (reviewer LOW note on db/index.ts:50-61,
 * T-1-01 follow-up).
 */
function runMigrations(connection: Database.Database): void {
  const apply = connection.transaction(() => {
    connection.exec(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        id TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      );
    `);

    const applied = new Set(
      connection.prepare('SELECT id FROM schema_migrations').all().map((row) => (row as { id: string }).id)
    );

    for (const file of listMigrationFiles()) {
      if (applied.has(file)) continue;
      const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf-8');
      connection.exec(sql);
      connection.prepare('INSERT INTO schema_migrations (id) VALUES (?)').run(file);
    }
  });

  apply.immediate();
}

/**
 * Returns the singleton SQLite connection, running migrations on first access. WAL mode and
 * foreign keys are enabled so the Express process and a future MCP sibling process (D-19) can
 * share the file safely, with a busy timeout so concurrent writers wait instead of erroring.
 */
export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = resolveDbPath();
  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  runMigrations(db);

  return db;
}

/** Close the singleton connection and clear it so the next `getDb()` reopens. Used by tests. */
export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

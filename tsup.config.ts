import { defineConfig } from 'tsup';
import fs from 'node:fs';
import path from 'node:path';

const MIGRATIONS_SRC_DIR = path.resolve('src/backend/db/migrations');
const MIGRATIONS_OUT_DIR = path.resolve('api/_backend/migrations');

/**
 * Bundle the Express backend into a single ESM file that is deployed alongside
 * the Vercel Function in /api. This avoids importing raw TS sources at runtime
 * (which are not present in the serverless bundle).
 */
export default defineConfig({
  entry: ['src/backend/app.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  outDir: 'api/_backend',
  outExtension: () => ({ js: '.js' }),
  splitting: false,
  sourcemap: true,
  clean: true,
  treeshake: true,
  minify: false,
  // Keep runtime deps external (they'll be in node_modules in the function bundle).
  // better-sqlite3 ships a native binding and must never be bundled (D-12).
  external: ['express', 'cors', '@supabase/supabase-js', 'better-sqlite3'],
  // `src/backend/db/index.ts` resolves `MIGRATIONS_DIR` as `<module dir>/migrations` at
  // runtime (works unmodified under `tsx` since the .sql files sit next to the source). The
  // bundle is a single file at `api/_backend/app.js`, so after tsup emits it we copy the
  // migration .sql files next to it at `api/_backend/migrations/` so the same relative lookup
  // resolves there too (reviewer warning on src/backend/db/index.ts:34, T-1-01 follow-up).
  onSuccess: async () => {
    fs.mkdirSync(MIGRATIONS_OUT_DIR, { recursive: true });
    const files = fs.readdirSync(MIGRATIONS_SRC_DIR).filter((file) => file.endsWith('.sql'));
    for (const file of files) {
      fs.copyFileSync(path.join(MIGRATIONS_SRC_DIR, file), path.join(MIGRATIONS_OUT_DIR, file));
    }
  },
});

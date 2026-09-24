import { defineConfig } from 'tsup';

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
});

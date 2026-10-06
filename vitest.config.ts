import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Standalone vitest config (D-20): deliberately does not reuse `vite.config.ts` (React/Tailwind
 * plugins, sub-path `base`) since all phase-1 tests are plain Node/TypeScript unit tests against
 * `src/domain/*` and `src/backend/db/*`. Revisit if/when component tests are added.
 */
export default defineConfig({
  // T-4-24: lets the few component-rendering tests resolve the `@/` alias the app uses.
  resolve: { alias: { '@': path.resolve(__dirname, '.') } },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    // T-2-03 review carry-over: the full suite (esp. the Data Manager events fixture tests, ~60
    // events/500+ property occurrences) exceeds vitest's 5s default under parallel CI/local load.
    testTimeout: 15000,
  },
});

import { defineConfig } from 'vitest/config';

/**
 * Standalone vitest config (D-20): deliberately does not reuse `vite.config.ts` (React/Tailwind
 * plugins, sub-path `base`) since all phase-1 tests are plain Node/TypeScript unit tests against
 * `src/domain/*` and `src/backend/db/*`. Revisit if/when component tests are added.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});

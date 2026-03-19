import { createApp } from '../src/backend/app';

// Single gateway entry point for all /api/* requests.
// Express routing is handled by `src/backend/app.ts`.
const app = createApp();
export default app;


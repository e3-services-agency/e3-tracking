/**
 * Express app: single entry point for all API routes (D-15: Project replaces Workspace).
 *
 * Usage:
 *   import { createApp } from './backend/app.js';
 *   const app = createApp();
 *   app.listen(process.env.PORT ?? 3001);
 *
 * Local-first (D-09, D-13): `AUTH_MODE=local` by default, no remote dependency.
 */
import express from 'express';
import cors from 'cors';
import clientsRouter from './routes/clients';
import projectsRouter from './routes/projects';
import sourcesRouter from './routes/sources';
import propertiesRouter from './routes/properties';
import eventsRouter from './routes/events';
import catalogsRouter from './routes/catalogs';
import bundlesRouter from './routes/bundles';
import filesRouter from './routes/files';
import exportRouter from './routes/export';
import sharedRouter from './routes/shared';
import { removedRouter } from './routes/removed';
import { optionalAuth } from './middleware/auth';
import { requireProject } from './middleware/project';
import { getDb } from './db';
import { BadRequestError, ConfigError } from './errors';

function getCorsOrigin(): string | string[] | boolean {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || typeof raw !== 'string') return true; // reflect request origin (flexible for previews)
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function createApp(): express.Express {
  // Open the database and run pending migrations before the first request (D-12); safe to call
  // more than once (singleton connection), so `server.ts` calling `getDb()` too is a no-op.
  getDb();

  const app = express();

  app.use(
    cors({
      origin: getCorsOrigin(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      optionsSuccessStatus: 204,
    })
  );
  app.use(optionalAuth);
  app.use(express.json());

  app.use('/api/clients', clientsRouter);
  app.use('/api/projects', projectsRouter);

  // Project-scoped sub-routers (D-15): requireProject validates `:projectId` and sets req.projectId.
  app.use('/api/projects/:projectId/sources', requireProject, sourcesRouter);
  app.use('/api/projects/:projectId/properties', requireProject, propertiesRouter);
  app.use('/api/projects/:projectId/events', requireProject, eventsRouter);
  app.use('/api/projects/:projectId/catalogs', requireProject, catalogsRouter);
  app.use('/api/projects/:projectId/bundles', requireProject, bundlesRouter);
  app.use('/api/projects/:projectId/files', requireProject, filesRouter);
  app.use('/api/projects/:projectId/export', requireProject, exportRouter);

  // Public share-link mechanism (D-18): stub until phase 4 (see routes/shared.ts).
  app.use('/api/shared', sharedRouter);

  // Removed in the schema rewrite (D-18); journeys/metrics never had tables in the fresh schema
  // and T-1-03 removed every frontend code path that called them, so no stub is mounted for them
  // anymore. Old-variant stays 501 until T-1-05 introduces the real Variant model.
  app.use('/api/projects/:projectId/qa-runs', requireProject, removedRouter('T-1-05'));
  app.use('/api/projects/:projectId/variants', requireProject, removedRouter('T-1-05'));

  // Simple health endpoint. Kept in Express so we don't need a separate Vercel function on the
  // Hobby plan.
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Global error handler: expose error.message and error.stack in JSON so the Network tab shows the real error.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    if (!(err instanceof BadRequestError)) {
      console.error(err);
    }
    if (res.headersSent) return;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const code =
      err instanceof ConfigError
        ? err.code
        : err instanceof BadRequestError
          ? err.code
          : 'INTERNAL_ERROR';
    const status =
      err instanceof ConfigError ? 503 : err instanceof BadRequestError ? 400 : 500;
    res.status(status).json({
      error: message,
      code,
      ...(err instanceof BadRequestError && { message }),
      ...(err instanceof BadRequestError && err.field && { field: err.field }),
      ...(err instanceof BadRequestError &&
        err.details && {
          property_id: err.details.property_id,
          value: err.details.value,
          allowed: err.details.allowed,
        }),
      ...(stack && { stack }),
    });
  });

  return app;
}

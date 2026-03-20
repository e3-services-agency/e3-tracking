/**
 * Express app: single entry point for all API routes.
 * The server MUST use this file (or a file that imports createApp from here) so that
 * /api/workspaces, /api/catalogs, and all other API routes are active.
 *
 * Usage:
 *   import { createApp } from './backend/app.js';
 *   const app = createApp();
 *   app.listen(process.env.PORT ?? 3001);
 *
 * Production: set CORS_ORIGIN (comma-separated origins) so the Vercel frontend can call the API.
 */
import express from 'express';
import cors from 'cors';
import workspacesRouter from './routes/workspaces';
import catalogsRouter from './routes/catalogs';
import eventsRouter from './routes/events';
import metricsRouter from './routes/metrics';
import propertiesRouter from './routes/properties';
import journeysRouter from './routes/journeys';
import sharedRouter from './routes/shared';
import { optionalAuth } from './middleware/auth';
import { ConfigError } from './errors';

function getCorsOrigin(): string | string[] | boolean {
  const raw = process.env.CORS_ORIGIN;
  if (!raw || typeof raw !== 'string') return true; // reflect request origin (flexible for previews)
  return raw.split(',').map((s) => s.trim()).filter(Boolean);
}

export function createApp(): express.Express {
  const app = express();

  app.use(
    cors({
      origin: getCorsOrigin(),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'x-workspace-id'],
      optionsSuccessStatus: 204,
    })
  );
  app.use(optionalAuth);
  app.use(express.json());

  app.use('/api/workspaces', workspacesRouter);
  app.use('/api/catalogs', catalogsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/metrics', metricsRouter);
  app.use('/api/properties', propertiesRouter);
  app.use('/api/journeys', journeysRouter);
  app.use('/api/shared', sharedRouter);

  // Simple health endpoint. Kept in Express so we don't need a separate
  // Vercel function on the Hobby plan.
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Global error handler: expose error.message and error.stack in JSON so the Network tab shows the real error.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    console.error(err);
    if (res.headersSent) return;
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    const code = err instanceof ConfigError ? err.code : 'INTERNAL_ERROR';
    const status = err instanceof ConfigError ? 503 : 500;
    res.status(status).json({
      error: message,
      code,
      ...(stack && { stack }),
    });
  });

  return app;
}

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
import workspacesRouter from './routes/workspaces.js';
import catalogsRouter from './routes/catalogs.js';
import eventsRouter from './routes/events.js';
import propertiesRouter from './routes/properties.js';
import journeysRouter from './routes/journeys.js';
import sharedRouter from './routes/shared.js';

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
  app.use(express.json());

  app.use('/api/workspaces', workspacesRouter);
  app.use('/api/catalogs', catalogsRouter);
  app.use('/api/events', eventsRouter);
  app.use('/api/properties', propertiesRouter);
  app.use('/api/journeys', journeysRouter);
  app.use('/api/shared', sharedRouter);

  return app;
}

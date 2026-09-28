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
import identityRulesRouter from './routes/identity-rules';
import consentCategoriesRouter from './routes/consent-categories';
import standardEventMappingsRouter from './routes/standard-event-mappings';
import projectVariantsRouter from './routes/project-variants';
import useCaseTemplatesRouter from './routes/use-case-templates';
import useCasesRouter from './routes/use-cases';
import requirementsMatrixRouter from './routes/requirements-matrix';
import importsRouter from './routes/imports';
import qaRunsRouter from './routes/qa-runs';
import observationsRouter from './routes/observations';
import comparisonRouter from './routes/comparison';
import findingsRouter from './routes/findings';
import rulesRouter from './routes/rules';
import ruleTemplatesRouter from './routes/rule-templates';
import historyRouter from './routes/history';
import restoreBackupRouter from './routes/restore-backup';
import { optionalAuth } from './middleware/auth';
import { actorContext } from './middleware/actor';
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
  // D-44, T-3-01: every request runs inside an actor context (AsyncLocalStorage) so
  // change-log.dal.ts's recordChange sees {actor: req.userName, source: 'ui'} without any route
  // threading a value through; must run after optionalAuth so req.userName is already set.
  app.use(actorContext);
  // T-3-05, D-45: a full JSON backup embeds every uploaded file as base64 and can be far larger
  // than every other Bloomreach paste box; these two routes get their own 100 MB limit, mounted
  // (with their own `express.json`) before the general 20 MB parser below so the request body is
  // only ever read once. Unscoped (no `:projectId`): restoring creates a brand-new project.
  app.use('/api/projects/restore-backup', express.json({ limit: '100mb' }), restoreBackupRouter);

  // T-2-03: default 100kb is too small for a pasted `data-manager-events.json` (the fixture alone is
  // ~360kb; a real Bloomreach project with 61+ event definitions and hundreds of properties is
  // comparable or larger) — every Bloomreach JSON paste box (D-04) shares this one body parser.
  app.use(express.json({ limit: '20mb' }));

  app.use('/api/clients', clientsRouter);
  app.use('/api/projects', projectsRouter);
  // Global (not project-scoped), the library is shared across clients (D-06).
  app.use('/api/use-case-templates', useCaseTemplatesRouter);

  // Project-scoped sub-routers (D-15): requireProject validates `:projectId` and sets req.projectId.
  app.use('/api/projects/:projectId/sources', requireProject, sourcesRouter);
  app.use('/api/projects/:projectId/properties', requireProject, propertiesRouter);
  app.use('/api/projects/:projectId/events', requireProject, eventsRouter);
  app.use('/api/projects/:projectId/catalogs', requireProject, catalogsRouter);
  app.use('/api/projects/:projectId/bundles', requireProject, bundlesRouter);
  app.use('/api/projects/:projectId/files', requireProject, filesRouter);
  app.use('/api/projects/:projectId/export', requireProject, exportRouter);
  // D-44, T-3-01: change_log read API (write side lives in the DAL, wired into mutation transactions).
  app.use('/api/projects/:projectId/history', requireProject, historyRouter);
  app.use('/api/projects/:projectId/identity-rules', requireProject, identityRulesRouter);
  app.use('/api/projects/:projectId/consent-categories', requireProject, consentCategoriesRouter);
  app.use('/api/projects/:projectId/standard-event-mappings', requireProject, standardEventMappingsRouter);
  app.use('/api/projects/:projectId/variants', requireProject, projectVariantsRouter);
  app.use('/api/projects/:projectId/use-cases', requireProject, useCasesRouter);
  app.use('/api/projects/:projectId/requirements-matrix', requireProject, requirementsMatrixRouter);
  app.use('/api/projects/:projectId/import', requireProject, importsRouter);
  app.use('/api/projects/:projectId/qa-runs', requireProject, qaRunsRouter);
  app.use('/api/projects/:projectId/observations', requireProject, observationsRouter);
  app.use('/api/projects/:projectId/comparison', requireProject, comparisonRouter);
  app.use('/api/projects/:projectId/findings', requireProject, findingsRouter);
  // D-30, D-31, T-2-06: rule CRUD (create/list-by-event nested under eventsRouter above).
  app.use('/api/projects/:projectId/rules', requireProject, rulesRouter);
  app.use('/api/projects/:projectId/rule-templates', requireProject, ruleTemplatesRouter);

  // Public share-link mechanism (D-18): stub until phase 4 (see routes/shared.ts).
  app.use('/api/shared', sharedRouter);

  // Removed in the schema rewrite (D-18); journeys/metrics never had tables in the fresh schema
  // and T-1-03 removed every frontend code path that called them, so no stub is mounted for them
  // anymore (`routes/removed.ts`, the 501-stub reference, was deleted by the T-3-08 dead-code
  // sweep since nothing referenced it after T-1-09). Variant is real as of T-1-05 (mounted as a
  // sub-path of eventsRouter above); QaRun, Observation, Finding are real as of T-1-09 (mounted
  // above).

  // Simple health endpoint. Kept in Express so we don't need a separate Vercel function on the
  // Hobby plan.
  app.get('/api/health', (_req, res) => {
    res.status(200).json({ ok: true });
  });

  // Global error handler: expose error.message and error.stack in JSON so the Network tab shows the real error.
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction): void => {
    if (res.headersSent) return;

    // fix round LOW 8: `express.json()` throws a plain `SyntaxError` (type `entity.parse.failed`)
    // for malformed JSON (e.g. a bare word like `abc`, or a bare `null`/number, which `strict`
    // mode also rejects at the top level) — this used to fall through to the generic 500
    // INTERNAL_ERROR branch below with a stack trace, even though it is entirely the caller's
    // fault. The Import page's preview/apply endpoints are the first to take arbitrary pasted
    // JSON as the whole request body, so this is now reachable from normal use, not just a test.
    if (err instanceof SyntaxError && (err as SyntaxError & { type?: string; status?: number }).type === 'entity.parse.failed') {
      res.status(400).json({ error: 'Request body is not valid JSON.', code: 'INVALID_JSON' });
      return;
    }

    if (!(err instanceof BadRequestError)) {
      console.error(err);
    }
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

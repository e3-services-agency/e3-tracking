/**
 * Shared error-to-HTTP mapping for route handlers (JSON error envelope, `{error, code, field?}`).
 */
import type { Response } from 'express';
import { BadRequestError, ConflictError, DatabaseError, NotFoundError, TemplateInUseError } from '../errors';

export function handleRouteError(err: unknown, res: Response): void {
  if (err instanceof NotFoundError) {
    res.status(404).json({ error: err.message, code: err.code, resource: err.resource });
    return;
  }
  // T-3-10 (D-47 amendment): checked before the generic `ConflictError` branch so the 409 body
  // also carries `count`/`project_names`.
  if (err instanceof TemplateInUseError) {
    res.status(409).json({ error: err.message, code: err.code, count: err.count, project_names: err.project_names });
    return;
  }
  if (err instanceof ConflictError) {
    res.status(409).json({ error: err.message, code: err.code, details: err.details });
    return;
  }
  if (err instanceof BadRequestError) {
    res.status(400).json({ error: err.message, code: err.code, field: err.field });
    return;
  }
  if (err instanceof DatabaseError) {
    res.status(500).json({ error: err.message, code: err.code });
    return;
  }
  console.error(err);
  res.status(500).json({
    error: err instanceof Error ? err.message : 'An unexpected error occurred.',
    code: 'INTERNAL_ERROR',
  });
}

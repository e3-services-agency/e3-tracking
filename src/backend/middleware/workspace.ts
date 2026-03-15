/**
 * Workspace isolation middleware.
 * Extracts workspace ID from x-workspace-id header and attaches to req.workspaceId.
 * Returns 403 Forbidden if header is missing or not a valid UUID.
 * Zero silent failures: explicit HTTP status and JSON body.
 */
import type { Request, Response, NextFunction } from 'express';

/** RFC 4122 UUID (version 1–5) or nil UUID (all zeros). */
const UUID_REGEX =
  /^(?:00000000-0000-0000-0000-000000000000|[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

const HEADER_NAME = 'x-workspace-id';

export function requireWorkspace(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const raw = req.headers[HEADER_NAME];
  const value = typeof raw === 'string' ? raw.trim() : undefined;

  if (value === undefined || value === '') {
    res.status(403).json({
      error: 'Missing workspace context.',
      code: 'WORKSPACE_REQUIRED',
      detail: `Request must include the ${HEADER_NAME} header with a valid workspace UUID.`,
    });
    return;
  }

  if (!UUID_REGEX.test(value)) {
    res.status(403).json({
      error: 'Invalid workspace identifier.',
      code: 'WORKSPACE_INVALID',
      detail: `${HEADER_NAME} must be a valid UUID (e.g. 550e8400-e29b-41d4-a716-446655440000).`,
    });
    return;
  }

  req.workspaceId = value;
  next();
}

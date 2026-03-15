/**
 * Backend error types for explicit HTTP handling.
 * Zero silent failures: map these to 4xx/5xx and JSON bodies in routes.
 */

export class ConflictError extends Error {
  readonly code = 'CONFLICT';
  constructor(message: string, public readonly details?: string) {
    super(message);
    this.name = 'ConflictError';
  }
}

export class DatabaseError extends Error {
  readonly code = 'DATABASE_ERROR';
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'DatabaseError';
  }
}

/** Use when a resource is not found or does not belong to the workspace (404). */
export class NotFoundError extends Error {
  readonly code = 'NOT_FOUND';
  constructor(message: string, public readonly resource?: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

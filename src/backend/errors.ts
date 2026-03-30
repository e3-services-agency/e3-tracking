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

/** Optional structured context for enum / field validation (HTTP 400 body). */
export type BadRequestDetails = {
  property_id: string;
  value: unknown;
  allowed: string[];
};

/** Invalid client payload (400). */
export class BadRequestError extends Error {
  readonly code = 'BAD_REQUEST';
  constructor(
    message: string,
    public readonly field?: string,
    public readonly details?: BadRequestDetails
  ) {
    super(message);
    this.name = 'BadRequestError';
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

/** Use when required env (e.g. SUPABASE_*) is missing. Map to 503 CONFIG_ERROR. */
export class ConfigError extends Error {
  readonly code = 'CONFIG_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

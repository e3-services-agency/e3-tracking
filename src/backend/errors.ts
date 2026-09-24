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
  readonly code: string = 'BAD_REQUEST';
  constructor(
    message: string,
    public readonly field?: string,
    public readonly details?: BadRequestDetails
  ) {
    super(message);
    this.name = 'BadRequestError';
  }
}

/**
 * Blank/invalid field on an otherwise well-formed request (400). Subclass of `BadRequestError`
 * so `routeErrors.ts`'s `instanceof BadRequestError` check already maps it; its own class and
 * code exist so callers (and tests) can tell "you sent something empty" apart from other 400s
 * without inspecting the message (fix round finding #7: validation must be 400, not 409).
 */
export class ValidationError extends BadRequestError {
  readonly code = 'VALIDATION_ERROR';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'ValidationError';
  }
}

/**
 * EventProperty.role is `discriminator` or `context` but the property has no `allowed_values_json`
 * (D-03, D-16; T-1-04 delta). 400.
 */
export class RoleRequiresEnumError extends BadRequestError {
  readonly code = 'ROLE_REQUIRES_ENUM';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'RoleRequiresEnumError';
  }
}

/** An event already has two `discriminator`-role properties (D-03 rule 3; T-1-04 delta). 400. */
export class MaxDiscriminatorsError extends BadRequestError {
  readonly code = 'MAX_DISCRIMINATORS';
  constructor(message: string, field?: string) {
    super(message, field);
    this.name = 'MaxDiscriminatorsError';
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

/** Use when required configuration env is missing/invalid. Map to 503 CONFIG_ERROR. */
export class ConfigError extends Error {
  readonly code = 'CONFIG_ERROR';
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

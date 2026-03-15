/**
 * Backend error types for explicit HTTP handling.
 * Zero silent failures: map these to 4xx/5xx and JSON bodies in routes.
 */
export class ConflictError extends Error {
    constructor(message, details) {
        super(message);
        this.details = details;
        this.code = 'CONFLICT';
        this.name = 'ConflictError';
    }
}
export class DatabaseError extends Error {
    constructor(message, cause) {
        super(message);
        this.cause = cause;
        this.code = 'DATABASE_ERROR';
        this.name = 'DatabaseError';
    }
}
/** Use when a resource is not found or does not belong to the workspace (404). */
export class NotFoundError extends Error {
    constructor(message, resource) {
        super(message);
        this.resource = resource;
        this.code = 'NOT_FOUND';
        this.name = 'NotFoundError';
    }
}

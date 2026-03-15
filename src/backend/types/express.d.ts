/**
 * Express request augmentation for workspace-scoped API.
 * Middleware attaches workspaceId after validating x-workspace-id header.
 */
import type { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      /** Set by workspace middleware; required for all data routes. */
      workspaceId?: string;
    }
  }
}

export {};

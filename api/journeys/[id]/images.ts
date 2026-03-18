import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../../../src/backend/app';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  const app = createApp();
  // Express expects req.url to exist; Vercel provides it.
  // This file exists to prevent Vercel platform NOT_FOUND for deep route.
  app(req as any, res as any);
}


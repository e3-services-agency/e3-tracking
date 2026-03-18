import type { IncomingMessage, ServerResponse } from 'http';
import { createApp } from '../../../../../src/backend/app';

export default function handler(req: IncomingMessage, res: ServerResponse): void {
  const app = createApp();
  app(req as any, res as any);
}


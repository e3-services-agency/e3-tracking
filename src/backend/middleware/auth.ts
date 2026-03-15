/**
 * Optional auth: extracts Bearer JWT and sets req.userId if valid.
 * Use requireAuth for routes that must be authenticated.
 */
import type { Request, Response, NextFunction } from 'express';
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

export async function optionalAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  const authHeader = req.headers.authorization;
  const token = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    ? authHeader.slice(7).trim()
    : null;
  if (!token || !SUPABASE_URL || !SUPABASE_ANON_KEY) {
    next();
    return;
  }
  try {
    const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const { data: { user }, error } = await client.auth.getUser(token);
    if (!error && user?.id) {
      req.userId = user.id;
    }
  } catch {
    // ignore invalid token
  }
  next();
}

export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (req.userId) {
    next();
    return;
  }
  res.status(401).json({
    error: 'Authentication required.',
    code: 'UNAUTHORIZED',
  });
}

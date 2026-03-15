import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL ?? '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? '';
export async function optionalAuth(req, _res, next) {
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
    }
    catch {
        // ignore invalid token
    }
    next();
}
export function requireAuth(req, res, next) {
    if (req.userId) {
        next();
        return;
    }
    res.status(401).json({
        error: 'Authentication required.',
        code: 'UNAUTHORIZED',
    });
}

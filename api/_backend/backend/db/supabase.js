/**
 * Safe Supabase client for Express backend (Service Role).
 *
 * ARCHITECTURE: Service Role bypasses RLS. We do NOT rely on
 * current_setting('app.workspace_id') for isolation. Instead, workspace
 * isolation is enforced in the Data Access Layer: every DAL function
 * receives workspaceId and every query explicitly includes workspace_id
 * in WHERE clauses and INSERT payloads. This avoids accidental cross-workspace
 * access and keeps the safety boundary in application code we control.
 *
 * RECOMMENDATION — Supabase JS vs pg pool:
 * - @supabase/supabase-js: Service role bypasses RLS, so we enforce workspace_id
 *   in every DAL call. No reliance on current_setting('app.workspace_id').
 *   Easiest and safest for Express: one place (DAL) to audit for isolation.
 * - Raw pg pool + set_config('app.workspace_id', ...): Would only enforce RLS
 *   if the pool used a DB role that does NOT bypass RLS; Supabase's default
 *   postgres user bypasses RLS, so we would need a dedicated role and extra
 *   setup. Join-table and bulk ops would still need explicit workspace_id
 *   in application code. We chose Supabase JS + strict DAL enforcement.
 */
import { createClient } from '@supabase/supabase-js';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
function requireEnv(name) {
    const value = process.env[name];
    if (value === undefined || value.trim() === '') {
        throw new Error(`Missing or empty required env: ${name}. Add it to your .env file.`);
    }
    return value.trim();
}
/**
 * Creates and returns the Supabase client. Throws if SUPABASE_URL or
 * SUPABASE_SERVICE_ROLE_KEY are missing (fail fast, no silent defaults).
 */
function getSupabaseClient() {
    const url = requireEnv('SUPABASE_URL');
    const key = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    return createClient(url, key, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
        },
    });
}
let client = null;
/**
 * Returns the singleton Supabase client. Call this after env is loaded (e.g. dotenv.config()).
 * Throws if required env vars are missing.
 */
export function getSupabase() {
    if (client === null) {
        client = getSupabaseClient();
    }
    return client;
}

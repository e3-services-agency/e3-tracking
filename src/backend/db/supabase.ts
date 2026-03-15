/**
 * Safe Supabase client for Express backend (Service Role).
 * Lazy initialization: no env checks at module load. getSupabase() returns null if env is missing
 * (caller should throw ConfigError so routes can respond with 503). Avoids crash-on-boot on Vercel.
 *
 * ARCHITECTURE: Service Role bypasses RLS. Workspace isolation is enforced in the DAL.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { ConfigError } from '../errors';

let client: SupabaseClient | null = null;
let configError: ConfigError | null = null;

/**
 * Returns the singleton Supabase client, or null if SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY
 * are missing. Does not throw; logs missing keys and returns null so the server stays up.
 */
export function getSupabase(): SupabaseClient | null {
  if (configError !== null) return null;
  if (client !== null) return client;

  const url = process.env.SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !key) {
    if (!url) console.error('[Supabase] Missing or empty required env: SUPABASE_URL');
    if (!key) console.error('[Supabase] Missing or empty required env: SUPABASE_SERVICE_ROLE_KEY');
    configError = new ConfigError(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Set them in the deployment environment.'
    );
    return null;
  }

  client = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  return client;
}

/**
 * Returns the Supabase client or throws ConfigError if env is missing. Use in DAL so routes can catch and send 503.
 */
export function getSupabaseOrThrow(): SupabaseClient {
  const c = getSupabase();
  if (c === null) throw configError ?? new ConfigError('Supabase is not configured.');
  return c;
}

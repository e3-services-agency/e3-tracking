/**
 * Supabase browser client for the frontend.
 * Uses anon key so Row Level Security (RLS) applies: requests run as the signed-in user.
 * Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your env.
 */
import { createClient } from '@supabase/supabase-js';

const url = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_URL
  ? String(import.meta.env.VITE_SUPABASE_URL).trim()
  : '';
const anonKey = typeof import.meta !== 'undefined' && import.meta.env?.VITE_SUPABASE_ANON_KEY
  ? String(import.meta.env.VITE_SUPABASE_ANON_KEY).trim()
  : '';

export function getSupabaseBrowser() {
  if (!url || !anonKey) {
    throw new Error(
      'Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY. Add them to your .env for auth and RLS.'
    );
  }
  return createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
}

let browserClient: ReturnType<typeof createClient> | null = null;

/**
 * Singleton browser Supabase client. Use for auth and for any direct DB access (RLS applies).
 */
export function getSupabaseClient() {
  if (browserClient === null) {
    browserClient = getSupabaseBrowser();
  }
  return browserClient;
}

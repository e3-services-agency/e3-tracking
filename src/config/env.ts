/**
 * Centralized env for frontend. Use for API base and base path so sub-path deployment works.
 * - If VITE_API_BASE_URL is set (e.g. cross-origin API), use it.
 * - Otherwise use import.meta.env.BASE_URL (e.g. /tracking-plan) so requests stay under the app sub-path.
 */
function getEnv(name: string): string | undefined {
  if (typeof import.meta === 'undefined') return undefined;
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  const v = env?.[name];
  return v != null && v !== '' ? String(v).trim() : undefined;
}

/** Base URL for API requests (no trailing slash). Same-origin when unset → use BASE_URL. */
export const API_BASE =
  getEnv('VITE_API_BASE_URL') != null
    ? String(getEnv('VITE_API_BASE_URL')).replace(/\/$/, '')
    : (getEnv('BASE_URL') != null ? String(getEnv('BASE_URL')).replace(/\/$/, '') : '');

/** Supabase project URL (no trailing slash). Used for building public Storage URLs. */
export const SUPABASE_URL =
  getEnv('VITE_SUPABASE_URL') != null
    ? String(getEnv('VITE_SUPABASE_URL')).replace(/\/$/, '')
    : '';

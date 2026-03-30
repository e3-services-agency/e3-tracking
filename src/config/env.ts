/**
 * Centralized env for frontend. Use for API base and base path so sub-path deployment works.
 * - If VITE_API_BASE_URL is set (e.g. cross-origin API), use it.
 * - Otherwise use '' so requests are same-origin `/api/...` (Express mounts at `/api`, not under Vite BASE_URL).
 */
function getEnv(name: string): string | undefined {
  if (typeof import.meta === 'undefined') return undefined;
  const env = (import.meta as { env?: Record<string, unknown> }).env;
  const v = env?.[name];
  return v != null && v !== '' ? String(v).trim() : undefined;
}

/** Base URL for API requests (no trailing slash). Same-origin when unset → '' → `/api/...` from site root. */
export const API_BASE =
  getEnv('VITE_API_BASE_URL') != null
    ? String(getEnv('VITE_API_BASE_URL')).replace(/\/$/, '')
    : '';

/**
 * Absolute URL for an in-app route (public share links, etc.).
 * Uses Vite BASE_URL so sub-path deploys (e.g. /tracking-plan/) match router + static hosting.
 */
export function buildAppPageUrl(pathFromRoot: string): string {
  if (typeof window === 'undefined') return '';
  const rawBase =
    getEnv('BASE_URL') != null && String(getEnv('BASE_URL')).trim() !== ''
      ? String(getEnv('BASE_URL'))
      : '/tracking-plan/';
  const baseNoTrailing = String(rawBase).replace(/\/$/, '');
  const path = pathFromRoot.startsWith('/') ? pathFromRoot : `/${pathFromRoot}`;
  return `${window.location.origin}${baseNoTrailing}${path}`;
}

/** Supabase project URL (no trailing slash). Used for building public Storage URLs. */
export const SUPABASE_URL =
  getEnv('VITE_SUPABASE_URL') != null
    ? String(getEnv('VITE_SUPABASE_URL')).replace(/\/$/, '')
    : '';

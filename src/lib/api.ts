/**
 * Centralized API client with global 401 handling.
 * When the backend returns 401 Unauthorized, the client signs out and redirects to login
 * (unless the user is already on the login page to avoid redirect loops).
 *
 * Configure once at app startup via setApiAuth() from a component inside AuthProvider.
 */

export interface ApiAuthConfig {
  getAccessToken: () => Promise<string | null>;
  signOut: () => Promise<void>;
  /** Base path for redirect (e.g. '' or '/tracking-plan'). No trailing slash. */
  basePath: string;
}

let authConfig: ApiAuthConfig | null = null;

/**
 * Set the auth config so fetchWithAuth can add the Bearer token and handle 401.
 * Call from a component inside AuthProvider (e.g. ApiAuthConfig). Pass null on unmount.
 */
export function setApiAuth(config: ApiAuthConfig | null): void {
  authConfig = config;
}

function isOnLoginPage(): boolean {
  if (typeof window === 'undefined') return false;
  return window.location.pathname.endsWith('/login');
}

/**
 * Fetch with Authorization: Bearer token and global 401 handling.
 * On 401: signs out, then hard-redirects to basePath/login (skipped if already on login page).
 */
export async function fetchWithAuth(url: string, init?: RequestInit): Promise<Response> {
  const headers = new Headers(init?.headers);
  if (!headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (authConfig?.getAccessToken) {
    const token = await authConfig.getAccessToken();
    if (token) headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, { ...init, headers });

  if (response.status === 401 && authConfig && !isOnLoginPage()) {
    authConfig.signOut().then(() => {
      const loginPath = `${authConfig!.basePath}/login`.replace(/\/+/g, '/');
      window.location.href = loginPath;
    });
  }

  return response;
}

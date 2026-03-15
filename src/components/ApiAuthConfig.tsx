/**
 * Configures the global API client with auth (getAccessToken, signOut) and base path
 * so that fetchWithAuth can attach the Bearer token and handle 401 by redirecting to login.
 * Must be mounted inside AuthProvider.
 */
import { useEffect } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';
import { setApiAuth } from '@/src/lib/api';

const BASE_PATH =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null
    ? String(import.meta.env.BASE_URL).replace(/\/$/, '')
    : '';

export function ApiAuthConfig({ children }: { children: React.ReactNode }) {
  const { getAccessToken, signOut } = useAuth();

  useEffect(() => {
    setApiAuth({
      getAccessToken,
      signOut,
      basePath: BASE_PATH,
    });
    return () => setApiAuth(null);
  }, [getAccessToken, signOut]);

  return <>{children}</>;
}

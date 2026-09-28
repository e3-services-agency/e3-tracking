/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { ApiAuthConfig } from './components/ApiAuthConfig';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { SharedProject } from './pages/SharedProject';

const BASE =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null
    ? String(import.meta.env.BASE_URL).replace(/\/$/, '')
    : '';

/** `/tracking-plan/shared/:token` (D-48, D-50, T-4-03): public, unauthenticated, rendered before
 * `ProtectedRoute`/`AuthProvider` gets a chance to redirect to `/login`. `undefined` for every
 * other path. */
function sharedTokenFromPath(pathname: string): string | undefined {
  const withoutBase = BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) || '/' : pathname;
  const match = withoutBase.match(/^\/shared\/([^/]+)\/?$/);
  return match ? decodeURIComponent(match[1]) : undefined;
}

function AppContent() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';

  if (pathname.endsWith('/login')) {
    return <Login />;
  }

  const sharedToken = sharedTokenFromPath(pathname);
  if (sharedToken) {
    return <SharedProject token={sharedToken} />;
  }

  return (
    <ProtectedRoute>
      <Layout />
    </ProtectedRoute>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <ApiAuthConfig>
          <AppContent />
        </ApiAuthConfig>
      </AuthProvider>
    </ErrorBoundary>
  );
}

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
import { sharedTokenFromPath } from './sharedRoute';

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

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

function AppContent() {
  const pathname = typeof window !== 'undefined' ? window.location.pathname : '';

  if (pathname.endsWith('/login')) {
    return <Login />;
  }

  // Public share links are a phase 4 capability (D-27 consequence); /api/shared/* 501s until
  // then (T-1-03), so the share routes are not wired here yet.

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

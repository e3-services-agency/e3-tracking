/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AuthProvider } from './contexts/AuthContext';
import { ApiAuthConfig } from './components/ApiAuthConfig';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { Layout } from './components/layout/Layout';
import { Login } from './pages/Login';
import { SharedJourneyView } from './pages/SharedJourneyView';
import { SharedJourneyBriefView } from './pages/SharedJourneyBriefView';
import { SharedJourneysHubView } from './pages/SharedJourneysHubView';

function AppContent() {
  const [pathname, setPathname] = useState(
    typeof window !== 'undefined' ? window.location.pathname : ''
  );

  useEffect(() => {
    const onPopState = () => setPathname(window.location.pathname);
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const shareBriefMatch = pathname.match(/\/share\/journey\/([^/]+)\/brief$/);
  if (shareBriefMatch) {
    return <SharedJourneyBriefView journeyId={shareBriefMatch[1]} />;
  }

  const shareHubMatch = pathname.match(/\/share\/hub\/([^/]+)$/);
  if (shareHubMatch) {
    return <SharedJourneysHubView token={shareHubMatch[1]} />;
  }

  const shareByIdMatch = pathname.match(/\/share\/journey\/([^/]+)$/);
  if (shareByIdMatch) {
    return <SharedJourneyView journeyId={shareByIdMatch[1]} />;
  }

  const shareMatch = pathname.match(/\/share\/([^/]+)$/);
  if (shareMatch) {
    return <SharedJourneyView token={shareMatch[1]} />;
  }

  if (pathname.endsWith('/login')) {
    return <Login />;
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

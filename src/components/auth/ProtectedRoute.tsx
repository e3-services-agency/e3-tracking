/**
 * Renders children only when the user is authenticated; otherwise redirects to /login.
 * Use for all internal app routes. Keep /share/:token and /login public.
 */
import React, { useEffect } from 'react';
import { useAuth } from '@/src/contexts/AuthContext';

const BASE = typeof import.meta !== 'undefined' && (import.meta.env?.BASE_URL != null)
  ? String(import.meta.env.BASE_URL).replace(/\/$/, '')
  : '';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const loginPath = `${BASE}/login`;
      window.location.href = loginPath;
    }
  }, [user, loading]);

  if (loading) {
    return (
      <div
        className="min-h-screen flex items-center justify-center"
        style={{ backgroundColor: '#1A1E38', fontFamily: 'DM Sans, sans-serif' }}
      >
        <div className="text-white/80 text-sm">Loading…</div>
      </div>
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}

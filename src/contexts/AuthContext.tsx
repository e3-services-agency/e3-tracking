/**
 * Global auth state (D-13: local single-user auth mode). Keeps the `useAuth()` shape
 * (`user, loading, signIn, signOut, getAccessToken`) the rest of the app already depends on, but
 * the `local` provider never talks to a remote service: `user` is always the local admin,
 * `loading` is always false, `getAccessToken()` resolves to `null` (no bearer token is needed;
 * the backend's own `AUTH_MODE=local` treats every request as authenticated), and `signIn`/
 * `signOut` are no-ops. A future remote provider would replace only this file.
 */
import React, { createContext, useContext, useCallback, useMemo } from 'react';

interface LocalUser {
  id: string;
  email: string;
}

interface AuthState {
  user: LocalUser | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const LOCAL_USER: LocalUser = { id: 'local-user', email: 'local@e3-tracking.local' };

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const signIn = useCallback(async (): Promise<{ error: string | null }> => ({ error: null }), []);
  const signOut = useCallback(async (): Promise<void> => {}, []);
  const getAccessToken = useCallback(async (): Promise<string | null> => null, []);

  const value = useMemo<AuthState>(
    () => ({ user: LOCAL_USER, loading: false, signIn, signOut, getAccessToken }),
    [signIn, signOut, getAccessToken]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx == null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

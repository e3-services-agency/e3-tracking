/**
 * E3-branded login: Space Blue background, white card, Emerald primary button.
 */
import React, { useState } from 'react';
import { Mail, Lock } from 'lucide-react';
import { useAuth } from '@/src/contexts/AuthContext';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import { AGENCY_CONFIG } from '@/src/config/agency';

const SPACE_BLUE = '#1A1E38';
const E3_WHITE = '#EEEEE3';
const EMERALD = '#0DCC96';

const LOGO_SRC = `${import.meta.env.BASE_URL || '/'}branding/agency-logo.png`.replace(/\/+/g, '/');

export function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) {
      setError('Email and password are required.');
      return;
    }
    setLoading(true);
    setError(null);
    const { error: err } = await signIn(trimmedEmail, password);
    setLoading(false);
    if (err) {
      setError(err);
      return;
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-6"
      style={{ backgroundColor: SPACE_BLUE, fontFamily: 'DM Sans, sans-serif' }}
    >
      <div
        className="w-full max-w-md rounded-2xl shadow-xl border border-gray-200 overflow-hidden"
        style={{ backgroundColor: E3_WHITE }}
      >
        <div className="p-8 sm:p-10">
          <div className="flex justify-center mb-8 min-h-[2.5rem] items-center">
            {logoError ? (
              <span
                className="text-xl font-bold"
                style={{ color: SPACE_BLUE, fontFamily: 'DM Sans, sans-serif' }}
              >
                E3 Agency
              </span>
            ) : (
              <img
                src={LOGO_SRC}
                alt={AGENCY_CONFIG.name}
                className="h-10 w-auto object-contain"
                onError={() => setLogoError(true)}
              />
            )}
          </div>
          <h1 className="text-xl font-semibold text-center text-gray-900 mb-1">
            Tracking Portal
          </h1>
          <p className="text-sm text-gray-500 text-center mb-8">
            Sign in to manage your workspaces
          </p>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div
                className="p-3 rounded-lg text-sm text-red-800 bg-red-50 border border-red-200"
                role="alert"
              >
                {error}
              </div>
            )}
            <div className="relative">
              <label htmlFor="login-email" className="block text-sm font-medium text-gray-700 mb-1">
                Email
              </label>
              <div className="relative">
                <Input
                  id="login-email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full pr-10"
                  disabled={loading}
                />
                <span
                  className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"
                  style={{ color: EMERALD }}
                  aria-hidden
                >
                  <Mail className="h-5 w-5" />
                </span>
              </div>
            </div>
            <div className="relative">
              <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-1">
                Password
              </label>
              <div className="relative">
                <Input
                  id="login-password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pr-10"
                  disabled={loading}
                />
                <span
                  className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none"
                  style={{ color: EMERALD }}
                  aria-hidden
                >
                  <Lock className="h-5 w-5" />
                </span>
              </div>
            </div>
            <Button
              type="submit"
              className="w-full h-11 font-medium text-white"
              style={{ backgroundColor: EMERALD }}
              disabled={loading}
            >
              {loading ? 'Signing in…' : 'Sign in'}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}

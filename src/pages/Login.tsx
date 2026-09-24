/**
 * Local auth mode (D-13): there is no login form. `/login` immediately redirects into the app
 * (the local provider's `user` is always set).
 */
import { useEffect } from 'react';

const APP_ROOT =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null
    ? `${String(import.meta.env.BASE_URL).replace(/\/$/, '')}/`.replace(/\/+/g, '/')
    : '/';

export function Login() {
  useEffect(() => {
    window.location.href = APP_ROOT;
  }, []);
  return null;
}

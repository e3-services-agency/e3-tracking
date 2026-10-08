import { API_BASE } from '@/src/config/env';
export interface SharedGoogleConfig {
  enabled: boolean; client_id: string | null; csrf_token: string | null; nonce: string | null; signed_out: boolean;
  identity: { kind: 'google' | 'staff'; name: string; avatar_url: string | null; verified: true } | null;
}
export const sharedAuthUrl = (token: string, action: string): string => `${API_BASE}/api/shared/${encodeURIComponent(token)}/auth/${action}`;
export async function readGoogleConfig(token: string): Promise<SharedGoogleConfig> {
  const response = await fetch(sharedAuthUrl(token, 'config'), { credentials: 'same-origin', cache: 'no-store' });
  if (!response.ok) throw new Error('Sign-in options could not be loaded. You can continue as a guest.');
  return response.json();
}
export async function postGoogleAuth(token: string, action: 'google' | 'logout', csrf: string, credential?: string): Promise<void> {
  const response = await fetch(sharedAuthUrl(token, action), {
    method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ csrf_token: csrf, ...(credential ? { credential } : {}) }),
  });
  const body = await response.json();
  if (!response.ok) throw new Error(typeof body.error === 'string' ? body.error : 'Sign-in could not be completed.');
}
export function notifySharedIdentity(token: string): void {
  window.dispatchEvent(new CustomEvent('e3-share-identity-changed', { detail: { token } }));
}
interface GoogleIdentityApi {
  initialize(options: { client_id: string; callback: (result: { credential: string }) => void; nonce: string; auto_select: boolean; use_fedcm_for_prompt: boolean }): void;
  renderButton(element: HTMLElement, options: Record<string, unknown>): void;
  prompt(): void; cancel(): void; disableAutoSelect(): void;
}
declare global { interface Window { google?: { accounts: { id: GoogleIdentityApi } } } }
let scriptPromise: Promise<GoogleIdentityApi> | null = null;
export function loadGoogleIdentity(): Promise<GoogleIdentityApi> {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client'; script.async = true;
    const timer = window.setTimeout(() => { script.remove(); scriptPromise = null; reject(new Error('Google sign-in is unavailable. You can continue as a guest.')); }, 12000);
    script.onload = () => { window.clearTimeout(timer); if (window.google?.accounts?.id) resolve(window.google.accounts.id); else { scriptPromise = null; reject(new Error('Google sign-in is unavailable.')); } };
    script.onerror = () => { window.clearTimeout(timer); script.remove(); scriptPromise = null; reject(new Error('Google sign-in is unavailable. You can continue as a guest.')); };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

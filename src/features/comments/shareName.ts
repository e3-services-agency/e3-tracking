/**
 * The share visitor's display name, remembered per link in the browser (D-70 item 5, T-5-03):
 * `localStorage['e3.share.<token>.name']`. A tiny external store so every mounted panel, reaction
 * row and status control on the shared page sees the same name the moment one of them sets it.
 * Storage access is guarded: a private window or disabled storage uses an in-memory name.
 * Stable ownership comes from the server-issued HttpOnly guest cookie, never a display name.
 */
import { useEffect, useSyncExternalStore } from 'react';
import { API_BASE } from '@/src/config/env';
import { fetchWithAuth } from '@/src/lib/api';
import { isGeneratedVisitorName, type CommentParticipantView } from '@/src/domain/commentIdentity';

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export const shareNameKey = (token: string) => `e3.share.${token}.name`;

const LEGACY_KEY = 'e3-share-author';

/** A generated anonymous id ("Visitor 4f2a"), never a name the visitor typed. */
export const VISITOR_ID_RE = /^Visitor [0-9a-f]{4}$/;
export const isVisitorId = isGeneratedVisitorName;

export function readShareName(token: string): string {
  if (memory.has(token)) return memory.get(token)!;
  try {
    const stored = window.localStorage.getItem(shareNameKey(token));
    if (stored !== null) return stored;
    // One-time migration of the pre-T-5-03 global name into this link's key.
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy !== null) {
      window.localStorage.setItem(shareNameKey(token), legacy.slice(0, 80));
      window.localStorage.removeItem(LEGACY_KEY);
      return legacy.slice(0, 80);
    }
    return '';
  } catch {
    return '';
  }
}

/** Compatibility display helper: no attribution until the server identity is ready. */
export function ensureAuthorName(token: string): string {
  const participant = participantSnapshot(`shared:${token}`);
  if (!participant.ready) return '';
  if (participant.verified) return participant.name;
  const current = readShareName(token).trim();
  return current && !isVisitorId(current) ? current : participant.name;
}

/** Send only an explicitly chosen guest name. The server supplies anonymous/verified names. */
export function shareNamePayload(token: string): { author_name?: string } {
  const chosen = readShareName(token).trim();
  return chosen && !isVisitorId(chosen) ? { author_name: chosen } : {};
}

export function writeShareName(token: string, name: string): void {
  const clean = name.slice(0, 80);
  memory.set(token, clean);
  try {
    window.localStorage.setItem(shareNameKey(token), clean);
  } catch {
    // ignore: the in-memory copy still serves this page load
  }
  listeners.forEach((l) => l());
}

export function useShareName(token: string | null): [string, (name: string) => void] {
  const name = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => (token ? readShareName(token) : ''),
    () => ''
  );
  return [name, (n: string) => token && writeShareName(token, n)];
}

export interface CommentParticipantState extends CommentParticipantView {
  ready: boolean;
  loading: boolean;
  error: string | null;
}
const participants = new Map<string, CommentParticipantState>();
const pending = new Map<string, Promise<void>>();
const versions = new Map<string, number>();
const claimedVersions = new Map<string, number>();
function participantSnapshot(key: string): CommentParticipantState {
  let value = participants.get(key);
  if (!value) {
    // A browser-generated label could disagree with the real cookie-bound identity.
    value = { name: '', kind: key.startsWith('shared:') ? 'guest' : 'staff', avatar_url: null, verified: false, name_chosen: false, ready: false, loading: true, error: null };
    participants.set(key, value);
  }
  return value;
}
export function readCommentParticipant(mode: 'shared' | 'internal', id: string): CommentParticipantState {
  return participantSnapshot(`${mode}:${id}`);
}
/** Many panels share one parent comment list: refresh it once after each identity transition. */
export function claimCommentIdentityRefresh(mode: 'shared' | 'internal', id: string): boolean {
  const key = `${mode}:${id}`;
  const version = versions.get(key) ?? 0;
  if (!version || claimedVersions.get(key) === version) return false;
  claimedVersions.set(key, version);
  return true;
}
/** One request per mounted share page, shared by every root/reply composer. */
export function refreshCommentParticipant(mode: 'shared' | 'internal', id: string): Promise<void> {
  const key = `${mode}:${id}`;
  const existing = pending.get(key);
  if (existing) return existing;
  participants.set(key, { ...participantSnapshot(key), ready: false, loading: true, error: null });
  listeners.forEach((listener) => listener());
  const url = mode === 'shared' ? `${API_BASE}/api/shared/${encodeURIComponent(id)}/identity` : `${API_BASE}/api/projects/${encodeURIComponent(id)}/comments/identity`;
  const request = Promise.resolve().then(() => mode === 'shared' ? fetch(url) : fetchWithAuth(url)).then(async (response) => {
    if (!response.ok) throw new Error('Identity request failed');
    const value = await response.json() as CommentParticipantView;
    if (typeof value.name !== 'string' || !value.name.trim() || !['guest', 'google', 'staff'].includes(value.kind) || typeof value.verified !== 'boolean') throw new Error('Invalid identity response');
    participants.set(key, { ...value, ready: true, loading: false, error: null });
    versions.set(key, (versions.get(key) ?? 0) + 1);
    listeners.forEach((listener) => listener());
  }).catch(() => {
    // Do not attribute writes to a stale or fabricated identity after an offline/auth failure.
    participants.set(key, { ...participantSnapshot(key), name: '', avatar_url: null, verified: false, ready: false, loading: false, error: 'Posting identity unavailable. Retry before posting.' });
    listeners.forEach((listener) => listener());
  }).finally(() => { pending.delete(key); });
  pending.set(key, request);
  return request;
}
const initialized = new Set<string>();
export function useCommentParticipant(mode: 'shared' | 'internal', id: string): CommentParticipantState {
  const key = `${mode}:${id}`;
  const participant = useSyncExternalStore(
    (callback) => { listeners.add(callback); return () => listeners.delete(callback); },
    () => participantSnapshot(key),
    () => participantSnapshot(key)
  );
  useEffect(() => {
    if (!initialized.has(key)) { initialized.add(key); void refreshCommentParticipant(mode, id); }
    const onIdentityChanged = (event: Event) => {
      if (mode === 'shared' && (event as CustomEvent<{ token: string }>).detail?.token === id) void refreshCommentParticipant(mode, id);
    };
    window.addEventListener('e3-share-identity-changed', onIdentityChanged);
    return () => window.removeEventListener('e3-share-identity-changed', onIdentityChanged);
  }, [mode, id, key]);
  return participant;
}

/**
 * The share visitor's display name, remembered per link in the browser (D-70 item 5, T-5-03):
 * `localStorage['e3.share.<token>.name']`. A tiny external store so every mounted panel, reaction
 * row and status control on the shared page sees the same name the moment one of them sets it.
 * Storage access is guarded: a private window or disabled storage just does not remember.
 */
import { useSyncExternalStore } from 'react';

const memory = new Map<string, string>();
const listeners = new Set<() => void>();

export const shareNameKey = (token: string) => `e3.share.${token}.name`;

const LEGACY_KEY = 'e3-share-author';

/** A generated anonymous id ("Visitor 4f2a"), never a name the visitor typed. */
export const VISITOR_ID_RE = /^Visitor [0-9a-f]{4}$/;
export const isVisitorId = (name: string) => VISITOR_ID_RE.test(name);

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

/** The name to send for a write: the typed name, else a per-link random visitor id generated once and stored. */
export function ensureAuthorName(token: string): string {
  const current = readShareName(token).trim();
  if (current) return current;
  const id = `Visitor ${Math.floor(Math.random() * 0x10000).toString(16).padStart(4, '0')}`;
  writeShareName(token, id);
  return id;
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

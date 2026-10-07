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

export function readShareName(token: string): string {
  if (memory.has(token)) return memory.get(token)!;
  try {
    return window.localStorage.getItem(shareNameKey(token)) ?? '';
  } catch {
    return '';
  }
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

/**
 * `useViewState` (T-5-44): `useState` whose value outlives the component when a `ViewStateScope`
 * is mounted above it. The client portal wraps a list view in a scope so its search, filters,
 * sort and expanded rows are still there when the visitor comes back from an item's own page.
 * Without a scope (the internal app) it is plain `useState`.
 */
import React, { createContext, useCallback, useContext, useState } from 'react';

/** Values by `<scope>:<key>`; the owner keeps one store for the lifetime of the page. */
export type ViewStateStore = Map<string, unknown>;

const ScopeCtx = createContext<{ store: ViewStateStore; scope: string } | null>(null);

export function ViewStateScope({ store, scope, children }: { store: ViewStateStore; scope: string; children: React.ReactNode }) {
  const value = React.useMemo(() => ({ store, scope }), [store, scope]);
  return <ScopeCtx.Provider value={value}>{children}</ScopeCtx.Provider>;
}

export function useViewState<T>(key: string, initial: T): [T, (next: T | ((prev: T) => T)) => void] {
  const ctx = useContext(ScopeCtx);
  const storeKey = ctx ? `${ctx.scope}:${key}` : '';
  const [value, setValue] = useState<T>(() => (ctx && ctx.store.has(storeKey) ? (ctx.store.get(storeKey) as T) : initial));
  const update = useCallback(
    (next: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const resolved = typeof next === 'function' ? (next as (p: T) => T)(prev) : next;
        if (ctx) ctx.store.set(storeKey, resolved);
        return resolved;
      });
    },
    [ctx, storeKey]
  );
  return [value, update];
}

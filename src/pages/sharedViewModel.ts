/**
 * Pure helpers behind `SharedProject.tsx` (T-4-03, D-50), split into their own module with plain
 * relative imports (no `@/...` alias) so they are importable from a vitest test without pulling in
 * the whole React component tree or needing `vitest.config.ts` to know about Vite's `@` alias
 * (this repo's tests are plain-Node vitest, D-20, no jsdom, and `vitest.config.ts` deliberately does
 * not reuse `vite.config.ts`'s resolve/plugins).
 */
import { API_BASE } from '../config/env';
import type { TrackingDocument } from '../domain/document/trackingDocument';

/** Resolves a stored file path (e.g. `triggers[].image_path`, the project's `client_logo_path`)
 * to a fetchable URL through this token's public file route. */
export function sharedFileUrl(token: string, path: string): string {
  return `${API_BASE}/api/shared/${encodeURIComponent(token)}/files/${path}`;
}

export interface SharedViewModel {
  /** `doc.events` is already custom-first (D-34); this split makes the page's two sections
   * explicit and is the part a unit test can assert on without rendering anything. */
  customEvents: TrackingDocument['events'];
  otherEvents: TrackingDocument['events'];
}

export function buildSharedViewModel(doc: TrackingDocument): SharedViewModel {
  return {
    customEvents: doc.events.filter((e) => e.class === 'custom'),
    otherEvents: doc.events.filter((e) => e.class !== 'custom'),
  };
}

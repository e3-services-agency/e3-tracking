/**
 * UI-only state (D-18): the legacy in-memory data model (`mainData`, branches, `useActiveData`,
 * audit config, the old multi-step campaign flows feature) is removed. Every entity now lives in
 * SQLite behind the API (D-12); this
 * store only tracks what genuinely belongs to the browser tab: the active project and whichever
 * item id a page wants pre-selected.
 */
import { create } from 'zustand';

/**
 * The active project survives a page reload (T-1-02 fix round finding #3): persisted to
 * localStorage on every `setActiveProject`/`clearActiveProject` call, read back once at store
 * creation. Layout.tsx still lets the URL `/p/:key` win over this on mount/popstate; this is only
 * the fallback for URLs with no project segment (D-15).
 */
const ACTIVE_PROJECT_STORAGE_KEY = 'e3-tracking.activeProject';

type StoredActiveProject = { id: string; key: string | null };

function readStoredActiveProject(): StoredActiveProject | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(ACTIVE_PROJECT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredActiveProject>;
    if (typeof parsed?.id === 'string' && parsed.id) {
      return { id: parsed.id, key: typeof parsed.key === 'string' ? parsed.key : null };
    }
  } catch {
    // ignore corrupt storage
  }
  return null;
}

function writeStoredActiveProject(value: StoredActiveProject | null): void {
  if (typeof window === 'undefined') return;
  try {
    if (!value) {
      window.localStorage.removeItem(ACTIVE_PROJECT_STORAGE_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_PROJECT_STORAGE_KEY, JSON.stringify(value));
    }
  } catch {
    // ignore (private browsing / storage disabled)
  }
}

interface StoreState {
  /** Item id a page wants pre-selected/opened (e.g. deep-linking into an editor sheet). */
  selectedItemIdToEdit: string | null;
  setSelectedItemIdToEdit: (id: string | null) => void;

  /**
   * T-1-09: cross-page navigation without prop-drilling `setActiveTab` down to every page.
   * `Import.tsx`'s customer-events-export apply sets both `requestedTab: 'findings'` and
   * `pendingFindingsRunId` to the new run's id; `Layout.tsx` watches `requestedTab` and switches
   * the sidebar tab (clearing it so a later render does not re-trigger); `Findings.tsx` reads
   * `pendingFindingsRunId` once on mount to pre-filter the table, then clears it.
   */
  requestedTab: string | null;
  setRequestedTab: (tab: string | null) => void;
  pendingFindingsRunId: string | null;
  setPendingFindingsRunId: (id: string | null) => void;

  /**
   * T-2-09: the event id `EventCard.tsx` opens for the `'eventCard'` tab (the events table's row
   * link sets both this and `requestedTab: 'eventCard'`; `Findings.tsx`'s per-row event card link
   * does the same). Same cross-page navigation pattern as `requestedTab`/`pendingFindingsRunId`
   * above, so `EventCard.tsx` never needs a real router.
   */
  eventCardEventId: string | null;
  setEventCardEventId: (id: string | null) => void;

  activeProjectId: string;
  activeProjectKey: string | null;
  setActiveProject: (args: { id: string; key?: string | null }) => void;
  /** Clears project context (no project open). Used when route or membership rejects the current project. */
  clearActiveProject: () => void;
}

export const useStore = create<StoreState>((set) => {
  const storedActiveProject = readStoredActiveProject();

  return {
    selectedItemIdToEdit: null,
    setSelectedItemIdToEdit: (id) => set({ selectedItemIdToEdit: id }),

    requestedTab: null,
    setRequestedTab: (tab) => set({ requestedTab: tab }),
    pendingFindingsRunId: null,
    setPendingFindingsRunId: (id) => set({ pendingFindingsRunId: id }),

    eventCardEventId: null,
    setEventCardEventId: (id) => set({ eventCardEventId: id }),

    activeProjectId: storedActiveProject?.id ?? '',
    activeProjectKey: storedActiveProject?.key ?? null,

    setActiveProject: ({ id, key }) => {
      writeStoredActiveProject({ id, key: key ?? null });
      set({
        activeProjectId: id,
        activeProjectKey: key ?? null,
      });
    },

    clearActiveProject: () => {
      writeStoredActiveProject(null);
      set({
        activeProjectId: '',
        activeProjectKey: null,
      });
    },
  };
});

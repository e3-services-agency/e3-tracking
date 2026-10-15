/**
 * Client portal shell (T-5-42, D-88 plan section 4): the agency brand header, a read-only sidebar
 * in the internal app's style (`Sidebar.tsx` look, `navIcons.ts` icons) with each section's count
 * and its open comment threads, the project, the downloads and the comment identity. Below 1024px
 * the sidebar becomes a drawer behind a menu button.
 */
import React, { useEffect, useState } from 'react';
import { Download, LayoutDashboard, Menu, X } from 'lucide-react';
import { AgencyBrand } from '@/src/components/layout/AgencyBrand';
import { SHARED_SECTION_ICONS } from '@/src/components/layout/navIcons';
import { SharedGoogleSignIn } from '@/src/features/shared-auth/SharedGoogleSignIn';
import { openThreadCount, shareApiUrl, usePortal } from './PortalContext';
import { PORTAL_VIEW_ICON_KEYS, PortalLink, VIEW_COMMENT_TYPES } from './PortalParts';
import { PORTAL_VIEW_LABELS, type PortalView } from './portalModel';
import { portalSections } from './portalSections';

const ITEM = 'flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors';
const ACTIVE = 'bg-[var(--color-info)]/10 text-[var(--color-info)]';
const IDLE = 'text-gray-600 hover:bg-gray-50 hover:text-gray-900';

function NavItem({ view, count, active, onPick }: { view: PortalView; count: number | null; active: boolean; onPick: () => void }) {
  const { comments } = usePortal();
  const Icon = view === 'overview' ? LayoutDashboard : SHARED_SECTION_ICONS[PORTAL_VIEW_ICON_KEYS[view]];
  const open = openThreadCount(comments, VIEW_COMMENT_TYPES[view]);
  return (
    <PortalLink
      to={{ view, id: null }}
      className={`${ITEM} ${active ? ACTIVE : IDLE}`}
      aria-current={active ? 'page' : undefined}
      onClick={onPick}
      data-testid={`portal-nav-${view}`}
    >
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">{PORTAL_VIEW_LABELS[view]}</span>
      {open > 0 && (
        <span className="rounded-full bg-amber-50 px-1.5 text-xs font-medium text-amber-800" title={`${open} open comment thread${open === 1 ? '' : 's'}`} data-testid="nav-open-comments">
          {open}
        </span>
      )}
      {count !== null && <span className="text-xs font-normal tabular-nums text-gray-400">{count}</span>}
    </PortalLink>
  );
}

function SidebarContent({ onPick }: { onPick: () => void }) {
  const { header, summary, token, fileUrl, location } = usePortal();
  const sections = portalSections(summary);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-start gap-3 p-6 pb-4">
        {header.project.client_logo_path && <img src={fileUrl(header.project.client_logo_path)} alt="" className="h-8 w-8 shrink-0 object-contain" />}
        <div className="min-w-0">
          <p className="text-base font-bold leading-tight text-gray-900 [overflow-wrap:anywhere]" data-testid="portal-project-name">{header.project.name}</p>
          {header.client.name && <p className="mt-0.5 text-xs text-gray-500 [overflow-wrap:anywhere]">{header.client.name}</p>}
        </div>
      </div>
      <nav aria-label="Tracking plan sections" className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4">
        <NavItem view="overview" count={null} active={location.view === 'overview'} onPick={onPick} />
        {sections.map((s) => (
          <NavItem key={s.view} view={s.view} count={s.count} active={location.view === s.view} onPick={onPick} />
        ))}
      </nav>
      <div className="shrink-0 space-y-1 border-t p-4">
        {(['tracking-document.json', 'documentation.html'] as const).map((file) => (
          <a key={file} href={shareApiUrl(token, file)} className={`${ITEM} ${IDLE}`}>
            <Download className="h-4 w-4 shrink-0" aria-hidden="true" />
            {file.endsWith('.json') ? 'Download JSON' : 'Download HTML'}
          </a>
        ))}
        <div className="px-3">
          <SharedGoogleSignIn token={token} />
        </div>
      </div>
    </div>
  );
}

export function PortalShell({ notices, children }: { notices?: React.ReactNode; children: React.ReactNode }) {
  const { location } = usePortal();
  const [drawer, setDrawer] = useState(false);
  // A view change (link, back button) closes the drawer.
  useEffect(() => setDrawer(false), [location.view, location.id]);
  return (
    <div className="min-h-screen bg-[var(--surface-default)] font-sans text-gray-900">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-white/10 bg-[var(--e3-space-blue)] px-4 sm:px-6">
        <button
          type="button"
          className="rounded p-1 text-[var(--e3-white)] hover:bg-white/10 lg:hidden"
          aria-label={drawer ? 'Close menu' : 'Open menu'}
          aria-expanded={drawer}
          onClick={() => setDrawer((v) => !v)}
        >
          {drawer ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
        <AgencyBrand />
      </header>
      <div className="lg:flex">
        {drawer && <div className="fixed inset-0 top-14 z-40 bg-black/30 lg:hidden" aria-hidden="true" onClick={() => setDrawer(false)} />}
        {/* One sidebar: a drawer below 1024px while open, a sticky column from 1024px. */}
        <aside
          aria-label="Sidebar"
          className={`${drawer ? 'fixed left-0 top-14 z-50 block w-72 max-w-[85vw] shadow-xl' : 'hidden'} h-[calc(100vh-3.5rem)] shrink-0 border-r bg-white lg:sticky lg:top-14 lg:z-auto lg:block lg:w-64 lg:max-w-none lg:shadow-none`}
        >
          <SidebarContent onPick={() => setDrawer(false)} />
        </aside>
        <main className="min-w-0 flex-1">
          {notices}
          {children}
        </main>
      </div>
    </div>
  );
}

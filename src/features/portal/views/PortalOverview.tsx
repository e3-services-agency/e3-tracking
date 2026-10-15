/**
 * Portal overview (T-5-42 placeholder): the project, when the link was shared, and one card per
 * section with its count. T-5-43 replaces it with progress, findings by severity, waiting-on-you
 * threads and recent changes.
 */
import React from 'react';
import { SHARED_SECTION_ICONS } from '@/src/components/layout/navIcons';
import { openThreadCount, usePortal } from '../PortalContext';
import { PORTAL_VIEW_ICON_KEYS, PortalLink, PortalPage, VIEW_COMMENT_TYPES } from '../PortalParts';
import { PORTAL_VIEW_LABELS } from '../portalModel';
import { portalSections } from '../portalSections';

export function PortalOverview() {
  const { header, summary, comments } = usePortal();
  const sections = portalSections(summary);
  return (
    <PortalPage
      view="overview"
      title={header.project.name}
      notes={
        <p className="text-sm text-gray-500">
          {header.client.name && <>{header.client.name} · </>}Tracking plan, generated {new Date(summary.generated_at).toLocaleString()}
        </p>
      }
    >
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" aria-label="Sections">
        {sections.map(({ view, count }) => {
          const Icon = SHARED_SECTION_ICONS[PORTAL_VIEW_ICON_KEYS[view]];
          const open = openThreadCount(comments, VIEW_COMMENT_TYPES[view]);
          return (
            <li key={view}>
              <PortalLink
                to={{ view, id: null }}
                className="flex items-center gap-3 rounded-lg border bg-white p-4 shadow-sm hover:border-[var(--color-info)] hover:bg-gray-50"
              >
                {Icon && <Icon size={18} className="shrink-0 text-gray-500" aria-hidden="true" />}
                <span className="min-w-0 flex-1 font-medium text-gray-900">{PORTAL_VIEW_LABELS[view]}</span>
                {count !== null && <span className="text-sm tabular-nums text-gray-500">{count}</span>}
                {open > 0 && <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">{open} open</span>}
              </PortalLink>
            </li>
          );
        })}
      </ul>
    </PortalPage>
  );
}

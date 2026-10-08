import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/src/components/ui/Button';
import { EntityIcon } from '@/src/components/ui/EntityIcon';
import type { EntityKind } from '@/src/components/layout/navIcons';
import { STICKY_PX } from './viewHelpers';

interface ActiveSummary { row: HTMLTableRowElement; name: string; kind?: EntityKind; button: HTMLButtonElement; left: number; width: number }
/** One page listener/overlay; table overflow never clips this active-body control. */
export function SharedActiveEntitySummary({ container, revision }: {
  container: React.RefObject<HTMLElement | null>; revision: string;
}) {
  const [active, setActive] = useState<ActiveSummary | null>(null);
  useEffect(() => {
    let frame = 0;
    const update = () => {
      frame = 0;
      const root = container.current;
      if (!root) return setActive(null);
      const bounds = root.getBoundingClientRect();
      const left = Math.max(16, bounds.left);
      const width = Math.max(0, Math.min(window.innerWidth - 16, bounds.right) - left);
      if (width < 100) return setActive(null);
      for (const row of root.querySelectorAll<HTMLTableRowElement>('tr[data-shared-expanded="true"]')) {
        const detail = row.nextElementSibling?.querySelector<HTMLTableCellElement>('td');
        if (!detail) continue;
        const body = detail.getBoundingClientRect();
        if (body.height <= window.innerHeight - STICKY_PX.pageHeader) continue;
        if (row.getBoundingClientRect().bottom > STICKY_PX.pageHeader || body.top > STICKY_PX.pageHeader || body.bottom <= STICKY_PX.pageHeader + 112) continue;
        const button = document.getElementById(row.dataset.sharedDisclosure ?? '') as HTMLButtonElement | null;
        if (button) {
          setActive({ row, button, name: row.dataset.sharedName ?? '', kind: row.dataset.sharedKind as EntityKind | undefined, left, width });
          return;
        }
      }
      setActive(null);
    };
    const schedule = () => { if (!frame) frame = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
    if (container.current) resize?.observe(container.current);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('scroll', schedule, true); window.removeEventListener('resize', schedule); resize?.disconnect(); };
  }, [container, revision]);
  if (!active) return null;
  const collapse = () => {
    const { row, button } = active;
    button.click();
    setActive(null);
    requestAnimationFrame(() => {
      row.closest<HTMLElement>('[role="region"]')?.scrollTo?.({ left: 0, behavior: 'auto' });
      button.focus({ preventScroll: true });
      const margin = parseFloat(row.style.scrollMarginTop) || STICKY_PX.pageHeader;
      window.scrollTo({ top: Math.max(0, row.getBoundingClientRect().top + window.scrollY - margin - 8), behavior: 'auto' });
    });
  };
  return createPortal(<div role="region" aria-label="Active expanded entity" className="fixed z-20 flex items-start gap-3 rounded-b-md border bg-white px-3 py-2 shadow-md"
    style={{ top: STICKY_PX.pageHeader, left: active.left, width: active.width }}>
    {active.kind && <EntityIcon kind={active.kind} />}
    <span className="max-h-[min(6rem,20vh)] min-w-0 flex-1 overflow-y-auto whitespace-pre-wrap text-sm font-semibold [overflow-wrap:anywhere]">{active.name}</span>
    <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={collapse} aria-label={`Collapse ${active.name}`}>Collapse</Button>
  </div>, document.body);
}

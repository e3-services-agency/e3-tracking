/** Scroll spy (T-4-14): the id, out of `ids` (document order), that is currently on screen. */
import { useEffect, useState } from 'react';
import { pickActiveId } from './viewHelpers';

export function useActiveSection(ids: string[], topOffsetPx = 72): string | null {
  const [active, setActive] = useState<string | null>(null);
  const key = ids.join('|');
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return;
    const visible = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) visible.add(entry.target.id);
          else visible.delete(entry.target.id);
        }
        setActive(pickActiveId(ids, visible));
      },
      { rootMargin: `-${topOffsetPx}px 0px -60% 0px` }
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, topOffsetPx]);
  return active;
}

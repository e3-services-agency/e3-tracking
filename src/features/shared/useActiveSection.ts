/** Scroll spy (T-4-14): the id, out of `ids` (document order), that is currently on screen. */
import { useEffect, useState } from 'react';
import { pickActiveId, pickActiveAtBottom } from './viewHelpers';

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
    // The last sections are shorter than the band below the header, so at the end of the page they
    // never intersect it; fall back to the last section whose top is on screen.
    const onScroll = () => {
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (!atBottom) return;
      const tops = new Map<string, number>();
      for (const id of ids) {
        const el = document.getElementById(id);
        if (el) tops.set(id, el.getBoundingClientRect().top);
      }
      setActive(pickActiveAtBottom(ids, tops, window.innerHeight));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, topOffsetPx]);
  return active;
}

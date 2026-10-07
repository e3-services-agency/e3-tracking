/**
 * The one tooltip (T-4-29): opens on hover and on keyboard focus with no delay, rendered in a
 * portal (never clipped by a drawer's overflow), flips near the viewport edge, `role="tooltip"` +
 * `aria-describedby`, closes on Esc and blur. Colours come from CSS variables in `src/index.css`.
 * `useTooltip` is the primitive; `Tooltip` wraps arbitrary inline content.
 */
import React, { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { computeTooltipPosition } from '@/src/domain/tooltipPosition';

export function useTooltip(content: React.ReactNode | undefined) {
  const id = useId();
  const anchorRef = useRef<HTMLElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = useCallback(() => setOpen(true), []);
  const hide = useCallback(() => { setOpen(false); setPos(null); }, []);

  useLayoutEffect(() => {
    if (!open || !anchorRef.current || !tipRef.current) return;
    const a = anchorRef.current.getBoundingClientRect();
    const t = tipRef.current.getBoundingClientRect();
    const p = computeTooltipPosition(
      { top: a.top, left: a.left, width: a.width, height: a.height },
      { width: t.width, height: t.height },
      { width: window.innerWidth, height: window.innerHeight },
    );
    setPos({ top: p.top, left: p.left });
  }, [open, content]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') hide(); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    return () => { document.removeEventListener('keydown', onKey); window.removeEventListener('scroll', hide, true); };
  }, [open, hide]);

  const enabled = content !== undefined && content !== null && content !== '';
  const triggerProps = enabled
    ? { onMouseEnter: show, onMouseLeave: hide, onFocus: show, onBlur: hide, 'aria-describedby': open ? id : undefined }
    : {};
  const portal = enabled && open
    ? createPortal(
        <div
          ref={tipRef}
          id={id}
          role="tooltip"
          style={{ position: 'fixed', top: pos?.top ?? 0, left: pos?.left ?? 0, visibility: pos ? 'visible' : 'hidden' }}
          className="tooltip-surface z-[1000] max-w-xs rounded-md px-2.5 py-1.5 text-xs leading-snug shadow-lg pointer-events-none"
        >
          {content}
        </div>,
        document.body,
      )
    : null;
  return { anchorRef, triggerProps, portal, enabled };
}

export function Tooltip({ content, children, className }: { content: React.ReactNode | undefined; children: React.ReactNode; className?: string }) {
  const { anchorRef, triggerProps, portal } = useTooltip(content);
  return (
    <>
      <span ref={anchorRef} className={className} tabIndex={triggerProps.onFocus ? 0 : undefined} {...triggerProps}>{children}</span>
      {portal}
    </>
  );
}

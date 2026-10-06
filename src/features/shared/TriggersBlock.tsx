/**
 * Triggers block (T-4-14, D-50), used by the internal event card and the shared view: per trigger
 * the title, the page URL as a link and the description, plus one image gallery whose thumbnails
 * open a plain overlay lightbox (no dependency; Escape closes, arrow keys step, wrap-around).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { lightboxStep } from './viewHelpers';
import { triggerImages } from '@/src/domain/document/triggerImages';

export interface TriggerData {
  title: string | null;
  description: string | null;
  image_path: string | null;
  /** T-4-24: every screenshot in order; `image_path` is the first. */
  images?: string[];
  page_url: string | null;
}

export function TriggersBlock({ triggers, fileUrl }: { triggers: TriggerData[]; fileUrl: (path: string) => string }) {
  // T-4-24: a trigger can carry several screenshots; the lightbox steps through all of them.
  const images = triggers.flatMap((t) => triggerImages(t).map((path) => ({ path, title: t.title })));
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const isOpen = open !== null;

  // Focus trap + body scroll lock while the lightbox is open; focus returns to the thumbnail.
  useEffect(() => {
    if (!isOpen) return;
    opener.current = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () =>
      Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button, [href], [tabindex]:not([tabindex="-1"])') ?? []);
    (focusables()[0] ?? dialogRef.current)?.focus();
    const onTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        dialogRef.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !dialogRef.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onTab);
    return () => {
      document.removeEventListener('keydown', onTab);
      document.body.style.overflow = previousOverflow;
      opener.current?.focus?.();
    };
  }, [isOpen]);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : lightboxStep(i, 1, images.length)));
      else if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : lightboxStep(i, -1, images.length)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, images.length, close]);

  const current = open === null ? null : images[open];
  return (
    <div className="space-y-4">
      {triggers.map((trigger, i) => (
        <div key={i} className="border rounded-md p-3 flex gap-4 items-start">
          <div className="flex-1 min-w-0">
            {trigger.title && <h4 className="text-sm font-semibold text-gray-800">{trigger.title}</h4>}
            {trigger.page_url && (
              <p className="text-xs mt-1">
                <a href={trigger.page_url} target="_blank" rel="noreferrer" className="text-[var(--color-info)] hover:underline break-all">
                  {trigger.page_url}
                </a>
              </p>
            )}
            {trigger.description && <p className="text-sm text-gray-700 mt-1">{trigger.description}</p>}
          </div>
          {triggerImages(trigger).length > 0 && (
            <div className="shrink-0 flex flex-wrap gap-2 max-w-[60%] justify-end">
              {triggerImages(trigger).map((path) => (
                <button
                  key={path}
                  type="button"
                  onClick={() => setOpen(images.findIndex((img) => img.path === path))}
                  className="shrink-0 border rounded overflow-hidden hover:ring-2 hover:ring-[var(--color-info)]"
                  aria-label={`Enlarge ${trigger.title ?? 'trigger screenshot'}`}
                >
                  <img src={fileUrl(path)} alt={trigger.title ?? 'Trigger screenshot'} className="h-24 w-auto max-w-56 object-cover block" />
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Trigger screenshot"
          ref={dialogRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-6"
          onClick={close}
        >
          <img
            src={fileUrl(current.path)}
            alt={current.title ?? 'Trigger screenshot'}
            className="max-h-[80vh] max-w-full rounded shadow-lg"
            onClick={(e) => e.stopPropagation()}
          />
          <p className="mt-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
            {current.title ?? 'Screenshot'} ({(open ?? 0) + 1} / {images.length})
          </p>
          <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
            {images.length > 1 && (
              <>
                <button type="button" className="rounded bg-white px-3 py-1 text-sm" onClick={() => setOpen((i) => lightboxStep(i ?? 0, -1, images.length))}>
                  Previous
                </button>
                <button type="button" className="rounded bg-white px-3 py-1 text-sm" onClick={() => setOpen((i) => lightboxStep(i ?? 0, 1, images.length))}>
                  Next
                </button>
              </>
            )}
            <button type="button" className="rounded bg-white px-3 py-1 text-sm" onClick={close}>
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

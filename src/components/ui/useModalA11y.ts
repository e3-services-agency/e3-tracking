import { useEffect, useRef, type RefObject } from 'react';

/** Open dialogs, innermost last: only the top one reacts to Esc and Tab (T-4-27). */
const stack: symbol[] = [];

export function pushModal(): symbol {
  const id = Symbol('modal');
  stack.push(id);
  return id;
}
export function popModal(id: symbol): void {
  const at = stack.indexOf(id);
  if (at >= 0) stack.splice(at, 1);
}
export function isTopModal(id: symbol): boolean {
  return stack[stack.length - 1] === id;
}

/** Esc closes, focus moves into the dialog and is trapped, returns to the opener, body scroll locked.
 * Focus the dialog's content already placed inside it (T-5-42: a comment deep link focuses its
 * comment, and child effects run before this one) stays there. */
export function useModalA11y(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  // The opener is read during the first render, before any child effect can move focus.
  const openerRef = useRef<HTMLElement | null | undefined>(undefined);
  if (openerRef.current === undefined) openerRef.current = typeof document === 'undefined' ? null : (document.activeElement as HTMLElement | null);
  useEffect(() => {
    const id = pushModal();
    const opener = openerRef.current ?? null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusables = () =>
      Array.from(ref.current?.querySelectorAll<HTMLElement>('button, input, select, [href], [tabindex]:not([tabindex="-1"])') ?? []);
    if (!ref.current?.contains(document.activeElement)) (focusables()[0] ?? ref.current)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (!isTopModal(id)) return;
      if (e.key === 'Escape') {
        closeRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        ref.current?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !ref.current?.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (active === last || !ref.current?.contains(active))) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      popModal(id);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.();
    };
  }, [ref]);
}

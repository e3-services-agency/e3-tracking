import React, { useCallback, useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Maximize2, Minimize2 } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { useModalA11y } from './useModalA11y';
import { readSheetView, toggleSheetView, writeSheetView, SHEET_VIEW_KEY, type SheetView } from '@/src/domain/sheetView';

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  hideHeader?: boolean;
  /**
   * Fires once the closing exit animation has actually finished (fix round point 3): `isOpen`
   * turning `false` and the panel actually disappearing from the page are two different moments
   * (the spring exit transition below takes time), and callers that need to know "is the editor
   * really gone" — e.g. Properties.tsx's frozen row order — must use this, not `isOpen`.
   */
  onExitComplete?: () => void;
}

const VIEW_EVENT = 'e3-sheet-view';

/** The app-wide view preference (T-4-27): localStorage `e3.sheet.view`, shared by every Sheet. */
function useSheetView(): [SheetView, () => void] {
  const [view, setView] = useState<SheetView>(() => readSheetView(typeof window === 'undefined' ? null : window.localStorage));
  useEffect(() => {
    const sync = () => setView(readSheetView(window.localStorage));
    const onStorage = (e: StorageEvent) => { if (e.key === SHEET_VIEW_KEY) sync(); };
    window.addEventListener(VIEW_EVENT, sync);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(VIEW_EVENT, sync);
      window.removeEventListener('storage', onStorage);
    };
  }, []);
  const toggle = useCallback(() => {
    writeSheetView(window.localStorage, toggleSheetView(readSheetView(window.localStorage)));
    window.dispatchEvent(new Event(VIEW_EVENT));
  }, []);
  return [view, toggle];
}

function SheetPanel({ onClose, title, children, className, hideHeader }: Omit<SheetProps, 'isOpen' | 'onExitComplete'>) {
  const ref = useRef<HTMLDivElement>(null);
  useModalA11y(ref, onClose);
  const [view, toggleView] = useSheetView();
  const modal = view === 'modal';
  return (
    <>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 0.5 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 bg-black z-40"
      />
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        initial={modal ? { opacity: 0, scale: 0.97 } : { x: '100%' }}
        animate={modal ? { opacity: 1, scale: 1 } : { x: 0 }}
        exit={modal ? { opacity: 0, scale: 0.97 } : { x: '100%' }}
        transition={{ type: 'spring', damping: 25, stiffness: 200 }}
        className={cn(
          "fixed bg-[var(--surface-panel)] shadow-xl z-50 flex flex-col border-[var(--border-default)]",
          modal
            ? "left-[5vw] top-[5vh] h-[90vh] w-[90vw] rounded-lg border"
            : cn("right-0 top-0 h-full border-l", className || "w-[500px]")
        )}
      >
        {!hideHeader && (
          <div className="flex items-center justify-between p-6 border-b border-[var(--border-default)]">
            <h2 className="text-xl font-semibold">{title}</h2>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={toggleView}
                aria-pressed={modal}
                aria-label={modal ? 'Back to side panel' : 'Open as full modal'}
                title={modal ? 'Back to side panel' : 'Open as full modal'}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                {modal ? <Minimize2 className="w-5 h-5 text-gray-500" /> : <Maximize2 className="w-5 h-5 text-gray-500" />}
              </button>
              <button type="button" onClick={onClose} aria-label="Close" className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        )}
        <div className="flex-1 overflow-y-auto p-6 relative">
          {children}
        </div>
      </motion.div>
    </>
  );
}

export function Sheet({ isOpen, onClose, title, children, className, hideHeader, onExitComplete }: SheetProps) {
  return (
    <AnimatePresence onExitComplete={onExitComplete}>
      {isOpen && (
        <SheetPanel onClose={onClose} title={title} className={className} hideHeader={hideHeader}>
          {children}
        </SheetPanel>
      )}
    </AnimatePresence>
  );
}

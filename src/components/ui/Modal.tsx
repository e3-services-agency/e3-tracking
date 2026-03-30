import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

type ModalProps = {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Merged onto the backdrop (e.g. higher z-index when opened above the event Sheet). */
  backdropClassName?: string;
  /** Merged onto the dialog panel (width, z-index, max-height). */
  className?: string;
  /** Merged onto the inner body wrapper (default `p-6`). */
  bodyClassName?: string;
};

/**
 * Product modal primitive.
 * Use only for confirmations, destructive actions, and small interactions.
 */
export function Modal({
  isOpen,
  onClose,
  title,
  children,
  className,
  backdropClassName,
  bodyClassName,
}: ModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className={cn('fixed inset-0 bg-black z-40', backdropClassName)}
            aria-hidden
          />
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 240 }}
            className={cn(
              'fixed left-1/2 top-1/2 z-50 w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-[var(--border-default)] bg-[var(--surface-panel)] shadow-xl',
              className
            )}
            role="dialog"
            aria-modal="true"
          >
            {title ? (
              <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default)]">
                <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            ) : null}
            <div className={cn('p-6', bodyClassName)}>{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}


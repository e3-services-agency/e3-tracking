import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X } from 'lucide-react';
import { cn } from '@/src/lib/utils';

interface SheetProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
  hideHeader?: boolean;
}

export function Sheet({ isOpen, onClose, title, children, className, hideHeader }: SheetProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.5 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className={cn("fixed right-0 top-0 h-full bg-white shadow-xl z-50 flex flex-col", className || "w-[500px]")}
          >
            {!hideHeader && (
              <div className="flex items-center justify-between p-6 border-b">
                <h2 className="text-xl font-semibold">{title}</h2>
                <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full">
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto p-6 relative">
              {children}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
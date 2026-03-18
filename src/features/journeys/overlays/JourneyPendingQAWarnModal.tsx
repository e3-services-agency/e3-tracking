import React from 'react';
import { Button } from '@/src/components/ui/Button';

type JourneyPendingQAWarnModalProps = {
  isOpen: boolean;
  onClose: () => void;
};

export function JourneyPendingQAWarnModal({
  isOpen,
  onClose,
}: JourneyPendingQAWarnModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-6 w-[520px] border border-[var(--border-default)]">
        <h2 className="text-lg font-bold text-gray-900 mb-3">
          Pending QA steps
        </h2>
        <div className="text-sm text-gray-700">
          There are steps with pending status. Are you sure you want to proceed?
        </div>
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} type="button">
            OK
          </Button>
        </div>
      </div>
    </div>
  );
}


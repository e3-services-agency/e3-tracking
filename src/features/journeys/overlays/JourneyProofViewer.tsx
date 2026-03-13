import React from 'react';
import { Button } from '@/src/components/ui/Button';
import { X } from 'lucide-react';
import type { QAProof } from '@/src/types';

type JourneyProofViewerProps = {
  proof: QAProof | null;
  onClose: () => void;
};

export const JourneyProofViewer = ({
  proof,
  onClose,
}: JourneyProofViewerProps) => {
  if (!proof) return null;

  return (
    <div
      className="fixed inset-0 z-[100] bg-black/80 flex items-center justify-center p-6"
      onClick={onClose}
    >
      <div
        className="relative w-full h-full max-w-6xl max-h-[95vh] bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
          <div className="min-w-0">
            <div className="text-sm font-semibold text-gray-900 truncate">
              {proof.name}
            </div>
            <div className="text-xs text-gray-500">
              {proof.type.toUpperCase()} •{' '}
              {new Date(proof.createdAt).toLocaleString()}
            </div>
          </div>

          <Button
            variant="outline"
            size="sm"
            type="button"
            onClick={onClose}
          >
            <X className="w-4 h-4 mr-2" />
            Close
          </Button>
        </div>

        <div className="flex-1 overflow-auto bg-gray-100 p-4">
          {proof.type === 'image' ? (
            <img
              src={proof.content}
              alt={proof.name}
              className="max-w-full max-h-full mx-auto rounded border bg-white"
            />
          ) : (
            <pre className="text-sm bg-white border rounded p-4 whitespace-pre-wrap break-words min-h-full">
              {proof.content}
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};


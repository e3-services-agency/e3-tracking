import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { AlertTriangle, CheckCircle2, X } from 'lucide-react';
import type { QAStatus } from '@/src/types';

export const StrictHandles = ({
  color,
  isQAMode,
}: {
  color: string;
  isQAMode?: boolean;
}) => (
  <>
    <Handle
      type="target"
      position={Position.Top}
      id="top"
      className={`w-4 h-4 transition-transform hover:scale-125 ${color} ${
        isQAMode ? 'opacity-0 pointer-events-none' : ''
      }`}
    />
    <Handle
      type="source"
      position={Position.Right}
      id="right"
      className={`w-4 h-4 transition-transform hover:scale-125 ${color} ${
        isQAMode ? 'opacity-0 pointer-events-none' : ''
      }`}
    />
    <Handle
      type="source"
      position={Position.Bottom}
      id="bottom"
      className={`w-4 h-4 transition-transform hover:scale-125 ${color} ${
        isQAMode ? 'opacity-0 pointer-events-none' : ''
      }`}
    />
    <Handle
      type="target"
      position={Position.Left}
      id="left"
      className={`w-4 h-4 transition-transform hover:scale-125 ${color} ${
        isQAMode ? 'opacity-0 pointer-events-none' : ''
      }`}
    />
  </>
);

export const QAStatusBadge = ({ status }: { status?: QAStatus }) => {
  if (!status || status === 'Pending') {
    return (
      <div className="absolute -top-3 -right-3 bg-amber-100 text-amber-700 border border-amber-300 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm flex items-center gap-1 z-20">
        <AlertTriangle className="w-3 h-3" /> Pending
      </div>
    );
  }

  if (status === 'Passed') {
    return (
      <div className="absolute -top-3 -right-3 bg-emerald-100 text-emerald-700 border border-emerald-300 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm flex items-center gap-1 z-20">
        <CheckCircle2 className="w-3 h-3" /> Passed
      </div>
    );
  }

  if (status === 'Failed') {
    return (
      <div className="absolute -top-3 -right-3 bg-red-100 text-red-700 border border-red-300 rounded-full px-2 py-0.5 text-[10px] font-bold shadow-sm flex items-center gap-1 z-20">
        <X className="w-3 h-3" /> Failed
      </div>
    );
  }

  return null;
};


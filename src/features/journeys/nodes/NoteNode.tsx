import React from 'react';
import { useReactFlow, NodeProps } from '@xyflow/react';
import { StickyNote, X } from 'lucide-react';

import {
  NoteFlowNode,
  JourneyFlowNode,
  JourneyFlowEdge,
  isNoteNode,
} from '@/src/features/journeys/nodes/types';

export const NoteNode = ({ id, data, selected }: NodeProps<NoteFlowNode>) => {
  const { setNodes } = useReactFlow<JourneyFlowNode, JourneyFlowEdge>();
  const isQAMode = !!data.activeQARunId;

  return (
    <div
      className={`bg-yellow-100 border ${
        selected
          ? 'border-yellow-500 shadow-lg ring-1 ring-yellow-400'
          : 'border-yellow-300 shadow-md'
      } w-[220px] h-[220px] flex flex-col relative rounded-sm transition-all`}
    >
      <div className="bg-yellow-200/60 h-7 w-full flex items-center px-3 cursor-grab drag-handle">
        <StickyNote className="w-3 h-3 text-yellow-600 mr-2" />
        <span className="text-[10px] text-yellow-700 font-bold uppercase tracking-wider">
          Note
        </span>
      </div>
      <textarea
        className="flex-1 w-full bg-transparent p-3 resize-none outline-none text-sm text-gray-800 placeholder-yellow-600/50 nodrag"
        placeholder="Write a note..."
        value={data.text}
        onChange={(e) =>
          !isQAMode &&
          setNodes((nds) =>
            nds.map((n) =>
              n.id === id && isNoteNode(n)
                ? { ...n, data: { ...n.data, text: e.target.value } }
                : n,
            ),
          )
        }
        disabled={isQAMode}
      />
    </div>
  );
};


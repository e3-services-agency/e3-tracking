import React, { useState } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Plus, Image as ImageIcon, Zap } from 'lucide-react';

import {
  JourneyFlowNode,
  JourneyFlowEdge,
  JourneyStepFlowNode,
} from '@/src/features/journeys/nodes/types';

type JourneyQuickAddMenuProps = {
  nodeId: string;
  position: 'right' | 'bottom';
};

export const JourneyQuickAddMenu = ({
  nodeId,
  position,
}: JourneyQuickAddMenuProps) => {
  const { getNode, getNodes, setNodes, setEdges } =
    useReactFlow<JourneyFlowNode, JourneyFlowEdge>();
  const [isOpen, setIsOpen] = useState(false);

  const handleAdd = (type: JourneyFlowNode['type']) => {
    const node = getNode(nodeId);
    if (!node) return;

    const newNodeId = `${type}-${Date.now()}`;
    const offsetX = position === 'right' ? 350 : 0;
    const offsetY = position === 'bottom' ? 250 : 0;
    const stepCount = getNodes().filter(
      (n) => n.type === 'journeyStepNode',
    ).length;

    const newNode: JourneyFlowNode =
      type === 'journeyStepNode'
        ? {
            id: newNodeId,
            type,
            position: {
              x: node.position.x + offsetX,
              y: node.position.y + offsetY,
            },
            data: { label: `Step ${stepCount + 1}`, description: '' },
          }
        : {
            id: newNodeId,
            type: 'triggerNode',
            position: {
              x: node.position.x + offsetX,
              y: node.position.y + offsetY,
            },
            data: { description: '', connectedEvent: null },
          };

    const newEdge: JourneyFlowEdge = {
      id: `e-${nodeId}-${newNodeId}`,
      source: nodeId,
      sourceHandle: position,
      target: newNodeId,
      targetHandle: position === 'right' ? 'left' : 'top',
      animated: true,
      style: { stroke: 'var(--border-default)', strokeWidth: 2 },
      type: 'smoothstep',
    };

    setNodes((nds) => nds.concat(newNode));
    setEdges((eds) => eds.concat(newEdge));
    setIsOpen(false);
  };

  const posClass =
    position === 'right'
      ? 'top-1/2 -right-8 -translate-y-1/2'
      : 'left-1/2 -bottom-8 -translate-x-1/2';

  return (
    <div
      className={`absolute ${posClass} z-50 flex flex-col items-center nodrag`}
    >
      <button
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-6 h-6 bg-white border border-gray-300 text-gray-500 rounded-full flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 hover:border-blue-400 shadow-sm transition-all"
        title="Quick Add Node"
        type="button"
      >
        <Plus className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="absolute top-full mt-2 left-1/2 -translate-x-1/2 bg-white border border-gray-200 shadow-xl rounded-lg flex flex-col py-1 w-36">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAdd('journeyStepNode');
            }}
            className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-gray-50 text-left text-gray-700"
            type="button"
          >
            <ImageIcon className="w-3 h-3 text-gray-500" /> Add Step
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAdd('triggerNode');
            }}
            className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-amber-50 text-left text-gray-700"
            type="button"
          >
            <Zap className="w-3 h-3 text-amber-500" /> Add Trigger
          </button>
        </div>
      )}
    </div>
  );
};


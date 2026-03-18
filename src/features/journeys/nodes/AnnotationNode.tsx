import React from 'react';
import { NodeResizer, NodeProps } from '@xyflow/react';

import {
  AnnotationFlowNode,
} from '@/src/features/journeys/nodes/types';

export const AnnotationNode = ({ data, selected }: NodeProps<AnnotationFlowNode>) => {
  const isQAMode = !!data.activeQARunId;
  const color = data.color || 'var(--annotation-1)';

  return (
    <>
      {!isQAMode && (
        <NodeResizer
          color="var(--color-info)"
          isVisible={selected}
          minWidth={1}
          minHeight={1}
        />
      )}
      <div
        className={`w-full h-full rounded-sm border-2 border-dashed transition-colors relative overflow-hidden ${
          selected ? 'ring-2 ring-blue-400' : ''
        }`}
        style={{
          borderColor: color,
          pointerEvents: isQAMode ? 'none' : 'auto',
        }}
      >
        <div
          className="absolute inset-0"
          style={{
            backgroundColor: color,
            opacity: 0.14,
          }}
        />
      </div>
    </>
  );
};


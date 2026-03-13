import React from 'react';
import { NodeResizer, NodeProps } from '@xyflow/react';

import {
  AnnotationFlowNode,
} from '@/src/features/journeys/nodes/types';

export const AnnotationNode = ({ data, selected }: NodeProps<AnnotationFlowNode>) => {
  const isQAMode = !!data.activeQARunId;
  const color = data.color || '#FACC15';

  return (
    <>
      {!isQAMode && (
        <NodeResizer
          color="#3b82f6"
          isVisible={selected}
          minWidth={1}
          minHeight={1}
        />
      )}
      <div
        className={`w-full h-full rounded-sm border-2 border-dashed transition-colors ${
          selected ? 'ring-2 ring-blue-400' : ''
        }`}
        style={{
          borderColor: color,
          backgroundColor: `${color}22`,
          pointerEvents: isQAMode ? 'none' : 'auto',
        }}
      />
    </>
  );
};


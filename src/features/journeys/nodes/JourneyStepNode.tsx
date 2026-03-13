import React, { useCallback } from 'react';
import { useReactFlow, NodeProps } from '@xyflow/react';
import { Image as ImageIcon, UploadCloud, CheckCircle2 } from 'lucide-react';

import {
  JourneyStepFlowNode,
  JourneyFlowNode,
  JourneyFlowEdge,
  JourneyStepNodeData,
  isJourneyStepNode,
} from '@/src/features/journeys/nodes/types';
import { buildProofFromFile } from '@/src/features/journeys/lib/proofs';
import { StrictHandles, QAStatusBadge } from '@/src/features/journeys/nodes/NodeHandles';
import { JourneyQuickAddMenu } from '@/src/features/journeys/overlays/JourneyQuickAddMenu';

export const JourneyStepNode = ({ id, data }: NodeProps<JourneyStepFlowNode>) => {
  const { setNodes } = useReactFlow<JourneyFlowNode, JourneyFlowEdge>();

  const isQAMode = !!data.activeQARunId;
  const qaStatus = data.qaVerification?.status || 'Pending';
  const pendingProofs = data.pendingProofs || [];

  const updateNodeData = useCallback(
    (patch: Partial<JourneyStepNodeData>) => {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === id && isJourneyStepNode(n)
            ? { ...n, data: { ...n.data, ...patch } }
            : n,
        ),
      );
    },
    [id, setNodes],
  );

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (isQAMode) return;

    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const imageUrl = event.target?.result as string;
      updateNodeData({ imageUrl });
    };
    reader.readAsDataURL(file);
  };

  const handlePaste = useCallback(
    async (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i += 1) {
        if (items[i].type.includes('image')) {
          const file = items[i].getAsFile();
          if (!file) continue;

          if (isQAMode) {
            const proof = await buildProofFromFile(file);
            updateNodeData({ pendingProofs: [...pendingProofs, proof] });
          } else {
            const reader = new FileReader();
            reader.onload = (event) => {
              const imageUrl = event.target?.result as string;
              updateNodeData({ imageUrl });
            };
            reader.readAsDataURL(file);
          }

          e.preventDefault();
          break;
        }
      }
    },
    [isQAMode, pendingProofs, updateNodeData],
  );

  return (
    <div
      className={`bg-white border-2 ${
        isQAMode && qaStatus === 'Failed'
          ? 'border-red-400'
          : isQAMode && qaStatus === 'Passed'
            ? 'border-emerald-400'
            : 'border-gray-200'
      } rounded-lg shadow-sm min-w-[250px] max-w-[420px] overflow-visible group relative focus:outline-none`}
      onPaste={handlePaste}
      tabIndex={0}
    >
      {isQAMode && <QAStatusBadge status={qaStatus} />}
      <StrictHandles color="bg-gray-400" isQAMode={isQAMode} />
      {!isQAMode && <JourneyQuickAddMenu nodeId={id} position="right" />}

      <div className="bg-gray-50 px-3 py-2 border-b flex flex-col gap-2 rounded-t-lg">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <ImageIcon className="w-4 h-4" />
          <input
            type="text"
            value={data.label}
            onChange={(e) =>
              !isQAMode && updateNodeData({ label: e.target.value })
            }
            disabled={isQAMode}
            className="bg-transparent border-none focus:ring-0 p-0 font-semibold text-gray-700 w-full"
          />
        </div>

        <textarea
          placeholder="Step Description..."
          value={data.description}
          onChange={(e) =>
            !isQAMode && updateNodeData({ description: e.target.value })
          }
          disabled={isQAMode}
          className="w-full text-xs text-gray-600 bg-white border rounded p-1 resize-none h-16 disabled:bg-gray-50 nodrag"
        />
      </div>

      <div className="relative p-2">
        {data.imageUrl ? (
          <div className="relative inline-block w-full select-none">
            <img
              src={data.imageUrl}
              alt="Step"
              className="w-full h-auto rounded border"
              draggable={false}
            />
          </div>
        ) : (
          <label className="h-32 flex flex-col items-center justify-center bg-gray-50 border-2 border-dashed rounded text-gray-400 text-sm cursor-pointer hover:bg-gray-100 transition-colors">
            <UploadCloud className="w-6 h-6 mb-2" />
            <span className="font-medium">Upload Image</span>
            <span className="text-[10px] mt-1 text-gray-400">
              or click & paste (Ctrl+V)
            </span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageUpload}
              disabled={isQAMode}
            />
          </label>
        )}
      </div>

      {isQAMode && (
        <div className="p-2 border-t bg-blue-50/50">
          <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-blue-300 rounded bg-white text-blue-600 text-xs cursor-pointer hover:bg-blue-50 transition-colors">
            <UploadCloud className="w-4 h-4 mb-1" />
            <span className="font-semibold">Upload Proofs</span>
            <span className="text-gray-500 text-[10px] mt-1 text-center">
              Multiple screenshots or Paste (Ctrl+V)
            </span>
            <input
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;

                const newProofs = await Promise.all(
                  files.map(buildProofFromFile),
                );
                updateNodeData({
                  pendingProofs: [...pendingProofs, ...newProofs],
                });
                e.target.value = '';
              }}
            />
          </label>

          {pendingProofs.length > 0 && (
            <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              {pendingProofs.length} proof(s) ready to save
            </div>
          )}
        </div>
      )}
    </div>
  );
};


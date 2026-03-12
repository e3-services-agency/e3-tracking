import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useStore, useActiveData } from '@/src/store';
import { Button } from '@/src/components/ui/Button';
import { Input } from '@/src/components/ui/Input';
import {
  Plus,
  Trash2,
  Save,
  Image as ImageIcon,
  Zap,
  X,
  CheckSquare,
  AlertTriangle,
  CheckCircle2,
  UploadCloud,
  Search,
  ChevronDown,
  StickyNote,
  SquareDashed,
  Pencil,
} from 'lucide-react';
import {
  ReactFlow,
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Edge,
  Node,
  Handle,
  Position,
  ReactFlowProvider,
  useReactFlow,
  NodeProps,
  NodeResizer,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { QARun, QAStatus } from '@/src/types';

type AnnotationRect = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  color?: string;
  createdAt?: string;
};

type PendingConnection = {
  nodeId: string;
  handleId: string | null;
  handleType: 'source' | 'target' | null;
};

const StrictHandles = ({ color, isQAMode }: { color: string; isQAMode?: boolean }) => (
  <>
    <Handle
      type="target"
      position={Position.Top}
      id="top"
      className={`w-4 h-4 transition-transform hover:scale-125 ${color} ${isQAMode ? 'opacity-0 pointer-events-none' : ''}`}
    />
    <Handle
      type="source"
      position={Position.Right}
      id="right"
      className={`w-4 h-4 transition-transform hover:scale-125 ${color} ${isQAMode ? 'opacity-0 pointer-events-none' : ''}`}
    />
    <Handle
      type="source"
      position={Position.Bottom}
      id="bottom"
      className={`w-4 h-4 transition-transform hover:scale-125 ${color} ${isQAMode ? 'opacity-0 pointer-events-none' : ''}`}
    />
    <Handle
      type="target"
      position={Position.Left}
      id="left"
      className={`w-4 h-4 transition-transform hover:scale-125 ${color} ${isQAMode ? 'opacity-0 pointer-events-none' : ''}`}
    />
  </>
);

const QAStatusBadge = ({ status }: { status?: QAStatus }) => {
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

const QuickAddMenu = ({ nodeId, position }: { nodeId: string; position: 'right' | 'bottom' }) => {
  const { getNode, getNodes, setNodes, setEdges } = useReactFlow();
  const [isOpen, setIsOpen] = useState(false);

  const handleAdd = (type: 'journeyStepNode' | 'triggerNode') => {
    const node = getNode(nodeId);
    if (!node) return;

    const newNodeId = `${type}-${Date.now()}`;
    const offsetX = position === 'right' ? 350 : 0;
    const offsetY = position === 'bottom' ? 250 : 0;
    const stepCount = getNodes().filter((n) => n.type === 'journeyStepNode').length;

    const newNode: Node = {
      id: newNodeId,
      type,
      position: { x: node.position.x + offsetX, y: node.position.y + offsetY },
      data:
        type === 'journeyStepNode'
          ? { label: `Step ${stepCount + 1}`, description: '', rectangles: [] }
          : { description: '', connectedEvent: null },
    };

    const newEdge: Edge = {
      id: `e-${nodeId}-${newNodeId}`,
      source: nodeId,
      sourceHandle: position,
      target: newNodeId,
      targetHandle: position === 'right' ? 'left' : 'top',
      animated: true,
      style: { stroke: '#9CA3AF', strokeWidth: 2 },
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
    <div className={`absolute ${posClass} z-50 flex flex-col items-center nodrag`}>
      <button
        onBlur={() => setTimeout(() => setIsOpen(false), 200)}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(!isOpen);
        }}
        className="w-6 h-6 bg-white border border-gray-300 text-gray-500 rounded-full flex items-center justify-center hover:bg-blue-50 hover:text-blue-600 hover:border-blue-400 shadow-sm transition-all"
        title="Quick Add Node"
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
          >
            <ImageIcon className="w-3 h-3 text-gray-500" /> Add Step
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleAdd('triggerNode');
            }}
            className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-amber-50 text-left text-gray-700"
          >
            <Zap className="w-3 h-3 text-amber-500" /> Add Trigger
          </button>
        </div>
      )}
    </div>
  );
};

const JourneyStepNode = ({ id, data }: NodeProps) => {
  const { setNodes } = useReactFlow();
  const imageRef = useRef<HTMLImageElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  const isQAMode = !!data.activeQARunId;
  const qaVerification = isQAMode ? data.qaVerifications?.[data.activeQARunId as string]?.[id] : null;
  const qaStatus = qaVerification?.status || 'Pending';

  const rectangles: AnnotationRect[] = Array.isArray(data.rectangles) ? data.rectangles : [];
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [draftRect, setDraftRect] = useState<AnnotationRect | null>(null);
  const [startPoint, setStartPoint] = useState<{ x: number; y: number } | null>(null);

  const updateNodeData = useCallback(
    (patch: Record<string, unknown>) => {
      setNodes((nds) =>
        nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
      );
    },
    [id, setNodes]
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
    (e: React.ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i += 1) {
        if (items[i].type.includes('image')) {
          const file = items[i].getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const resultUrl = event.target?.result as string;
            if (isQAMode) {
              updateNodeData({ tempProofUrl: resultUrl });
            } else {
              updateNodeData({ imageUrl: resultUrl });
            }
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    },
    [isQAMode, updateNodeData]
  );

  const getRelativePoint = (clientX: number, clientY: number) => {
    const rect = overlayRef.current?.getBoundingClientRect();
    if (!rect) return null;

    const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
    const y = Math.max(0, Math.min(clientY - rect.top, rect.height));

    return { x, y, width: rect.width, height: rect.height };
  };

  const handleOverlayMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingMode || isQAMode) return;
    const point = getRelativePoint(e.clientX, e.clientY);
    if (!point) return;

    setStartPoint({ x: point.x, y: point.y });
    setDraftRect({
      id: `draft-${Date.now()}`,
      x: point.x,
      y: point.y,
      width: 0,
      height: 0,
      color: '#FACC15',
      createdAt: new Date().toISOString(),
    });
  };

  const handleOverlayMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawingMode || !startPoint || isQAMode) return;
    const point = getRelativePoint(e.clientX, e.clientY);
    if (!point) return;

    const x = Math.min(startPoint.x, point.x);
    const y = Math.min(startPoint.y, point.y);
    const width = Math.abs(point.x - startPoint.x);
    const height = Math.abs(point.y - startPoint.y);

    setDraftRect((prev) =>
      prev
        ? {
            ...prev,
            x,
            y,
            width,
            height,
          }
        : null
    );
  };

  const commitDraftRect = () => {
    if (!draftRect || draftRect.width < 8 || draftRect.height < 8) {
      setDraftRect(null);
      setStartPoint(null);
      return;
    }

    updateNodeData({
      rectangles: [
        ...rectangles,
        {
          ...draftRect,
          id: `rect-${Date.now()}`,
          color: '#FACC15',
          createdAt: new Date().toISOString(),
        },
      ],
    });

    setDraftRect(null);
    setStartPoint(null);
  };

  const handleOverlayMouseUp = () => {
    if (!isDrawingMode || isQAMode) return;
    commitDraftRect();
  };

  const handleOverlayMouseLeave = () => {
    if (!isDrawingMode || isQAMode) return;
    commitDraftRect();
  };

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
      {!isQAMode && <QuickAddMenu nodeId={id} position="right" />}

      <div className="bg-gray-50 px-3 py-2 border-b flex flex-col gap-2 rounded-t-lg">
        <div className="flex items-center justify-between gap-2 text-sm font-semibold text-gray-700">
          <div className="flex items-center gap-2 flex-1">
            <ImageIcon className="w-4 h-4" />
            <input
              type="text"
              value={(data.label as string) || 'Journey Step'}
              onChange={(e) => {
                if (isQAMode) return;
                updateNodeData({ label: e.target.value });
              }}
              disabled={isQAMode}
              className="bg-transparent border-none focus:ring-0 p-0 font-semibold text-gray-700 w-full"
            />
          </div>

          {!isQAMode && data.imageUrl && (
            <Button
              variant="outline"
              size="sm"
              className={`gap-2 h-8 ${isDrawingMode ? 'border-blue-500 text-blue-700 bg-blue-50' : ''}`}
              onClick={() => setIsDrawingMode((prev) => !prev)}
            >
              <Pencil className="w-3 h-3" />
              {isDrawingMode ? 'Exit Drawing' : 'Draw Annotation'}
            </Button>
          )}
        </div>

        <textarea
          placeholder="Step Description..."
          value={(data.description as string) || ''}
          onChange={(e) => {
            if (isQAMode) return;
            updateNodeData({ description: e.target.value });
          }}
          disabled={isQAMode}
          className="w-full text-xs text-gray-600 bg-white border rounded p-1 resize-none h-16 disabled:bg-gray-50 nodrag"
        />
      </div>

      <div className="relative p-2">
        {data.imageUrl ? (
          <div className="relative inline-block w-full select-none">
            <img
              ref={imageRef}
              src={data.imageUrl as string}
              alt="Step"
              className="w-full h-auto rounded border pointer-events-none"
              draggable={false}
            />

            <div
              ref={overlayRef}
              className={`absolute inset-0 rounded ${isDrawingMode ? 'nodrag nopan cursor-crosshair' : 'pointer-events-none'}`}
              onMouseDown={handleOverlayMouseDown}
              onMouseMove={handleOverlayMouseMove}
              onMouseUp={handleOverlayMouseUp}
              onMouseLeave={handleOverlayMouseLeave}
            />

            {rectangles.map((rect) => (
              <div
                key={rect.id}
                className="absolute rounded-sm border-2 pointer-events-none"
                style={{
                  left: rect.x,
                  top: rect.y,
                  width: rect.width,
                  height: rect.height,
                  borderColor: rect.color || '#FACC15',
                  backgroundColor: 'rgba(250, 204, 21, 0.12)',
                }}
              />
            ))}

            {draftRect && (
              <div
                className="absolute rounded-sm border-2 pointer-events-none"
                style={{
                  left: draftRect.x,
                  top: draftRect.y,
                  width: draftRect.width,
                  height: draftRect.height,
                  borderColor: '#FACC15',
                  backgroundColor: 'rgba(250, 204, 21, 0.12)',
                }}
              />
            )}
          </div>
        ) : (
          <label className="h-32 flex flex-col items-center justify-center bg-gray-50 border-2 border-dashed rounded text-gray-400 text-sm cursor-pointer hover:bg-gray-100 transition-colors">
            <UploadCloud className="w-6 h-6 mb-2" />
            <span className="font-medium">Upload Image</span>
            <span className="text-[10px] mt-1 text-gray-400">or click & paste (Ctrl+V)</span>
            <input type="file" accept="image/*" className="hidden" onChange={handleImageUpload} disabled={isQAMode} />
          </label>
        )}
      </div>

      {isQAMode && (
        <div className="p-2 border-t bg-blue-50/50">
          <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-blue-300 rounded bg-white text-blue-600 text-xs cursor-pointer hover:bg-blue-50 transition-colors">
            <UploadCloud className="w-4 h-4 mb-1" />
            <span className="font-semibold">Upload Proof</span>
            <span className="text-gray-500 text-[10px] mt-1 text-center">Screenshot or Paste (Ctrl+V)</span>
            <input
              type="file"
              accept="image/*,.json"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                  const proof = event.target?.result as string;
                  updateNodeData({ tempProofUrl: proof });
                };

                if (file.type.startsWith('image/')) {
                  reader.readAsDataURL(file);
                } else {
                  reader.readAsText(file);
                }
              }}
            />
          </label>
          {data.tempProofUrl && (
            <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Proof uploaded
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const TriggerNode = ({ id, data }: NodeProps) => {
  const { setNodes } = useReactFlow();
  const activeData = useActiveData();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const isQAMode = !!data.activeQARunId;
  const qaVerification = isQAMode ? data.qaVerifications?.[data.activeQARunId as string]?.[id] : null;
  const qaStatus = qaVerification?.status || 'Pending';

  const filteredEvents = (activeData.events ?? []).filter((e) =>
    e.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const updateNodeData = (patch: Record<string, unknown>) => {
    setNodes((nds) =>
      nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n))
    );
  };

  const handleEventSelect = (event: any, variant?: any) => {
    updateNodeData({
      connectedEvent: {
        eventId: event.id,
        variantId: variant?.id,
        name: event.name,
        variantName: variant?.name,
        description: event.description,
      },
    });
    setIsDropdownOpen(false);
    setSearchQuery('');
  };

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      if (!isQAMode) return;

      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i += 1) {
        if (items[i].type.includes('image')) {
          const file = items[i].getAsFile();
          if (!file) continue;

          const reader = new FileReader();
          reader.onload = (event) => {
            const proofUrl = event.target?.result as string;
            updateNodeData({ tempProofUrl: proofUrl });
          };
          reader.readAsDataURL(file);
          e.preventDefault();
          break;
        }
      }
    },
    [isQAMode]
  );

  return (
    <div
      className={`bg-white border-2 ${
        isQAMode && qaStatus === 'Failed'
          ? 'border-red-400'
          : isQAMode && qaStatus === 'Passed'
            ? 'border-emerald-400'
            : 'border-amber-400'
      } rounded-lg shadow-sm min-w-[280px] max-w-[320px] overflow-visible group relative focus:outline-none`}
      onPaste={handlePaste}
      tabIndex={0}
    >
      {isQAMode && <QAStatusBadge status={qaStatus} />}
      <StrictHandles color="bg-amber-400" isQAMode={isQAMode} />
      {!isQAMode && <QuickAddMenu nodeId={id} position="right" />}

      <div className="bg-amber-50 px-3 py-2 border-b border-amber-200 flex items-center gap-2 rounded-t-lg">
        <Zap className="w-4 h-4 text-amber-600" />
        <span className="text-sm font-bold text-amber-900">Trigger</span>
      </div>

      <div className="p-3 space-y-3">
        <textarea
          placeholder="Trigger Description..."
          value={(data.description as string) || ''}
          onChange={(e) => {
            if (isQAMode) return;
            updateNodeData({ description: e.target.value });
          }}
          disabled={isQAMode}
          className="w-full text-xs text-gray-600 bg-white border rounded p-2 resize-none h-16 disabled:bg-gray-50 nodrag"
        />

        {!data.connectedEvent ? (
          <div className="relative">
            <Button
              variant="outline"
              className="w-full justify-between text-sm border-dashed border-2"
              onClick={() => !isQAMode && setIsDropdownOpen(!isDropdownOpen)}
              disabled={isQAMode}
            >
              <span className="flex items-center gap-2 text-gray-500">
                <Plus className="w-4 h-4" /> Connect Event
              </span>
              <ChevronDown className="w-4 h-4 text-gray-400" />
            </Button>

            {isDropdownOpen && !isQAMode && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-md shadow-lg z-50 max-h-60 flex flex-col">
                <div className="p-2 border-b sticky top-0 bg-white">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400" />
                    <input
                      type="text"
                      placeholder="Search events..."
                      className="w-full pl-8 pr-2 py-1.5 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-amber-400 nodrag"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                </div>

                <div className="overflow-y-auto p-1">
                  {filteredEvents.map((event) => (
                    <div key={event.id}>
                      <button
                        className="w-full text-left px-2 py-1.5 text-sm hover:bg-amber-50 rounded flex items-center gap-2"
                        onClick={() => handleEventSelect(event)}
                      >
                        <Zap className="w-3 h-3 text-[#3E52FF]" />
                        <span className="font-medium truncate">{event.name}</span>
                      </button>

                      {event.variants?.map((variant: any) => (
                        <button
                          key={variant.id}
                          className="w-full text-left pl-6 pr-2 py-1 text-xs hover:bg-purple-50 rounded flex items-center gap-2 text-gray-600"
                          onClick={() => handleEventSelect(event, variant)}
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-purple-400" />
                          <span className="truncate">{variant.name}</span>
                        </button>
                      ))}
                    </div>
                  ))}

                  {filteredEvents.length === 0 && (
                    <div className="p-2 text-xs text-center text-gray-500">No events found.</div>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="bg-blue-50 border border-blue-200 rounded p-2 relative group">
            {!isQAMode && (
              <button
                className="absolute top-1 right-1 text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
                onClick={() => updateNodeData({ connectedEvent: null })}
              >
                <X className="w-3 h-3" />
              </button>
            )}

            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-3 h-3 text-[#3E52FF]" />
              <span className="text-sm font-bold text-blue-900 break-all">
                {(data.connectedEvent as any).name}
              </span>
            </div>

            {(data.connectedEvent as any).variantName && (
              <div className="inline-block text-[10px] font-medium text-purple-700 bg-purple-100 px-1.5 py-0.5 rounded border border-purple-200 mb-1">
                {(data.connectedEvent as any).variantName}
              </div>
            )}

            {(data.connectedEvent as any).description && (
              <div className="text-xs text-gray-600 line-clamp-2">
                {(data.connectedEvent as any).description}
              </div>
            )}
          </div>
        )}
      </div>

      {isQAMode && (
        <div className="p-2 border-t bg-blue-50/50">
          <label className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-blue-300 rounded bg-white text-blue-600 text-xs cursor-pointer hover:bg-blue-50 transition-colors">
            <UploadCloud className="w-4 h-4 mb-1" />
            <span className="font-semibold">Upload Proof</span>
            <span className="text-gray-500 text-[10px] mt-1 text-center">JSON, image, or Paste screenshot</span>
            <input
              type="file"
              accept=".json,image/*"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                  const proof = event.target?.result as string;
                  updateNodeData({ tempProofUrl: proof });
                };

                if (file.type.startsWith('image/')) {
                  reader.readAsDataURL(file);
                } else {
                  reader.readAsText(file);
                }
              }}
            />
          </label>

          {data.tempProofUrl && (
            <div className="mt-2 text-xs text-emerald-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" /> Proof uploaded
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const NoteNode = ({ id, data, selected }: NodeProps) => {
  const { setNodes } = useReactFlow();
  const isQAMode = !!data.activeQARunId;

  return (
    <div
      className={`bg-yellow-100 border ${
        selected ? 'border-yellow-500 shadow-lg ring-1 ring-yellow-400' : 'border-yellow-300 shadow-md'
      } w-[220px] h-[220px] flex flex-col relative rounded-sm transition-all`}
    >
      <div className="bg-yellow-200/60 h-7 w-full flex items-center px-3 cursor-grab drag-handle">
        <StickyNote className="w-3 h-3 text-yellow-600 mr-2" />
        <span className="text-[10px] text-yellow-700 font-bold uppercase tracking-wider">Note</span>
      </div>
      <textarea
        className="flex-1 w-full bg-transparent p-3 resize-none outline-none text-sm text-gray-800 placeholder-yellow-600/50 nodrag"
        placeholder="Write a note..."
        value={(data.text as string) || ''}
        onChange={(e) =>
          !isQAMode &&
          setNodes((nds) =>
            nds.map((n) => (n.id === id ? { ...n, data: { ...n.data, text: e.target.value } } : n))
          )
        }
        disabled={isQAMode}
      />
    </div>
  );
};

const HighlightNode = ({ selected, data }: NodeProps) => {
  const isQAMode = !!data.activeQARunId;
  return (
    <>
      {!isQAMode && (
        <NodeResizer color="#3b82f6" isVisible={selected} minWidth={50} minHeight={50} />
      )}
      <div
        className={`w-full h-full bg-yellow-300/30 border-2 border-yellow-400 border-dashed rounded-sm transition-colors ${
          selected ? 'border-blue-500 bg-yellow-300/40' : ''
        }`}
        style={{ pointerEvents: isQAMode ? 'none' : 'auto' }}
      />
    </>
  );
};

const nodeTypes = {
  journeyStepNode: JourneyStepNode,
  triggerNode: TriggerNode,
  noteNode: NoteNode,
  highlightNode: HighlightNode,
};

export function Journeys({
  selectedJourneyId: initialJourneyId,
  onBack,
}: {
  selectedJourneyId: string | null;
  onBack: () => void;
}) {
  const data = useActiveData();
  const { addJourney, updateJourney, deleteJourney } = useStore();

  const [selectedJourneyId, setSelectedJourneyId] = useState<string | null>(
    initialJourneyId || data.journeys[0]?.id || null
  );
  const [activeQARunId, setActiveQARunId] = useState<string | null>(null);
  const [isQAModalOpen, setIsQAModalOpen] = useState(false);
  const [newQARunName, setNewQARunName] = useState('');

  const selectedJourney = data.journeys.find((j) => j.id === selectedJourneyId);

  useEffect(() => {
    if (!selectedJourneyId && data.journeys.length > 0) {
      setSelectedJourneyId(data.journeys[0].id);
      return;
    }

    if (selectedJourneyId && !data.journeys.some((j) => j.id === selectedJourneyId)) {
      setSelectedJourneyId(data.journeys[0]?.id || null);
      setActiveQARunId(null);
    }
  }, [selectedJourneyId, data.journeys]);

  const handleCreateNew = () => {
    const newId = addJourney({
      name: 'New Journey',
      nodes: [],
      edges: [],
      qaRuns: [],
    });
    setSelectedJourneyId(newId);
    setActiveQARunId(null);
  };

  const handleStartQARun = () => {
    if (!selectedJourney || !newQARunName.trim()) return;

    const newRun: QARun = {
      id: `qa-${Date.now()}`,
      name: newQARunName.trim(),
      createdAt: new Date().toISOString(),
      nodes: JSON.parse(JSON.stringify(selectedJourney.nodes || [])),
      edges: JSON.parse(JSON.stringify(selectedJourney.edges || [])),
      verifications: {},
    };

    const updatedQaRuns = [...(selectedJourney.qaRuns || []), newRun];
    updateJourney(selectedJourney.id, { qaRuns: updatedQaRuns });
    setActiveQARunId(newRun.id);
    setIsQAModalOpen(false);
    setNewQARunName('');
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-white">
      <div className="p-4 border-b bg-white flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-gray-500 hover:text-gray-900">
            &larr; Back
          </Button>
          <h1 className="text-xl font-bold text-gray-900">Journeys</h1>

          <div className="flex gap-2 flex-wrap">
            {data.journeys.map((j) => (
              <button
                key={j.id}
                onClick={() => {
                  setSelectedJourneyId(j.id);
                  setActiveQARunId(null);
                }}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  selectedJourneyId === j.id
                    ? 'bg-blue-50 text-[#3E52FF]'
                    : 'text-gray-600 hover:bg-gray-50'
                }`}
              >
                {j.name}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2 items-center">
          {selectedJourney && (
            <div className="flex items-center gap-2 mr-4 border-r pr-4">
              <span className="text-sm font-medium text-gray-700">QA Runs</span>
              <select
                className="text-sm border rounded p-1.5 bg-gray-50"
                value={activeQARunId || ''}
                onChange={(e) => setActiveQARunId(e.target.value || null)}
              >
                <option value="">-- Design Mode --</option>
                {(selectedJourney.qaRuns || []).map((run: any) => (
                  <option key={run.id} value={run.id}>
                    {run.name}
                  </option>
                ))}
              </select>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setNewQARunName(`QA Run - ${new Date().toLocaleDateString()}`);
                  setIsQAModalOpen(true);
                }}
                className="gap-2"
              >
                <CheckSquare className="w-4 h-4" /> Start QA Run
              </Button>
            </div>
          )}

          {selectedJourney && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const dataStr =
                    'data:text/json;charset=utf-8,' +
                    encodeURIComponent(JSON.stringify(selectedJourney, null, 2));
                  const downloadAnchorNode = document.createElement('a');
                  downloadAnchorNode.setAttribute('href', dataStr);
                  downloadAnchorNode.setAttribute(
                    'download',
                    `${selectedJourney.name.replace(/\s+/g, '_')}.json`
                  );
                  document.body.appendChild(downloadAnchorNode);
                  downloadAnchorNode.click();
                  downloadAnchorNode.remove();
                }}
                className="gap-2"
              >
                <Save className="w-4 h-4" /> Export
              </Button>

              <label className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium bg-white border rounded-md shadow-sm hover:bg-gray-50 cursor-pointer transition-colors">
                <Plus className="w-4 h-4" /> Import
                <input
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const importedJourney = JSON.parse(event.target?.result as string);
                        if (importedJourney && importedJourney.nodes && importedJourney.edges) {
                          const createdId = addJourney({
                            ...importedJourney,
                            name: `${importedJourney.name || 'Journey'} (Imported)`,
                            qaRuns: importedJourney.qaRuns || [],
                          });
                          setSelectedJourneyId(createdId);
                          setActiveQARunId(null);
                        } else {
                          alert('Invalid journey JSON format.');
                        }
                      } catch {
                        alert('Error parsing JSON file.');
                      }
                    };
                    reader.readAsText(file);
                    e.target.value = '';
                  }}
                />
              </label>

              <Button
                variant="destructive"
                size="sm"
                onClick={() => {
                  deleteJourney(selectedJourney.id);
                  onBack();
                }}
                className="gap-2"
              >
                <Trash2 className="w-4 h-4" /> Delete
              </Button>
            </>
          )}

          <Button
            onClick={handleCreateNew}
            variant="default"
            size="sm"
            className="gap-2 bg-[#3E52FF] hover:bg-blue-600 text-white"
          >
            <Plus className="w-4 h-4" /> New Journey
          </Button>
        </div>
      </div>

      <div className="flex-1 relative">
        {selectedJourney ? (
          <ReactFlowProvider>
            <JourneyCanvas journey={selectedJourney} activeQARunId={activeQARunId} />
          </ReactFlowProvider>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500">
            Select or create a journey to view the canvas.
          </div>
        )}
      </div>

      {isQAModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 w-96">
            <h2 className="text-lg font-bold text-gray-900 mb-4">Start New QA Run</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">QA Run Name</label>
                <Input
                  value={newQARunName}
                  onChange={(e) => setNewQARunName(e.target.value)}
                  placeholder="e.g. Release 1.2 QA"
                  autoFocus
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsQAModalOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={handleStartQARun} disabled={!newQARunName.trim()}>
                  Start QA
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function JourneyCanvas({ journey, activeQARunId }: { journey: any; activeQARunId: string | null }) {
  const { updateJourney } = useStore();
  const { screenToFlowPosition } = useReactFlow();

  const [nodes, setNodes, onNodesChange] = useNodesState(journey.nodes || []);
  const [edges, setEdges, onEdgesChange] = useEdgesState(journey.edges || []);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [menuPos, setMenuPos] = useState<{ x: number; y: number } | null>(null);
  const [pendingConnection, setPendingConnection] = useState<PendingConnection | null>(null);

  useEffect(() => {
    if (!activeQARunId) {
      setNodes(journey.nodes || []);
      setEdges(journey.edges || []);
      setSelectedNodeId(null);
    }
  }, [journey.id, activeQARunId, journey.nodes, journey.edges, setNodes, setEdges]);

  useEffect(() => {
    const activeQARun = (journey.qaRuns || []).find((r: QARun) => r.id === activeQARunId);

    if (activeQARunId && activeQARun) {
      const runNodes = activeQARun.nodes || journey.nodes || [];
      const runEdges = activeQARun.edges || journey.edges || [];

      setNodes(
        runNodes.map((n: any) => ({
          ...n,
          data: {
            ...n.data,
            activeQARunId,
            qaVerifications: { [activeQARunId]: activeQARun.verifications || {} },
          },
        }))
      );
      setEdges(runEdges);

      if (!selectedNodeId && runNodes.length > 0) {
        setSelectedNodeId(runNodes[0].id);
      }
    } else {
      setNodes(
        (journey.nodes || []).map((n: any) => ({
          ...n,
          data: {
            ...n.data,
            activeQARunId: null,
            qaVerifications: undefined,
          },
        }))
      );
      setEdges(journey.edges || []);
    }
  }, [activeQARunId, journey.qaRuns, journey.nodes, journey.edges, selectedNodeId, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection | Edge) => {
      if (activeQARunId) return;
      setEdges((eds) =>
        addEdge(
          {
            ...params,
            animated: true,
            style: { stroke: '#9CA3AF', strokeWidth: 2 },
            type: 'smoothstep',
          } as Edge,
          eds
        )
      );
    },
    [setEdges, activeQARunId]
  );

  const onConnectStart = useCallback((_: any, params: any) => {
    setPendingConnection({
      nodeId: params.nodeId,
      handleId: params.handleId ?? null,
      handleType: params.handleType ?? null,
    });
  }, []);

  const onConnectEnd = useCallback(
    (event: MouseEvent | TouchEvent) => {
      if (activeQARunId || !pendingConnection) return;

      const target = event.target as HTMLElement | null;
      const droppedOnPane = !!target?.closest('.react-flow__pane');

      if (droppedOnPane && pendingConnection.handleType === 'source') {
        const point = 'touches' in event ? event.touches[0] : event;
        setMenuPos({ x: point.clientX, y: point.clientY });
      } else {
        setPendingConnection(null);
      }
    },
    [activeQARunId, pendingConnection]
  );

  const handleAddConnectedNode = (type: 'journeyStepNode' | 'triggerNode') => {
    if (!menuPos || !pendingConnection) return;

    const position = screenToFlowPosition({ x: menuPos.x, y: menuPos.y });
    const newNodeId = `${type}-${Date.now()}`;
    const stepCount = nodes.filter((n) => n.type === 'journeyStepNode').length;

    const newNode: Node = {
      id: newNodeId,
      type,
      position,
      data:
        type === 'journeyStepNode'
          ? { label: `Step ${stepCount + 1}`, description: '', rectangles: [] }
          : { description: '', connectedEvent: null },
    };

    setNodes((nds) => nds.concat(newNode));

    if (pendingConnection.nodeId) {
      setEdges((eds) =>
        addEdge(
          {
            id: `e-${pendingConnection.nodeId}-${newNodeId}`,
            source: pendingConnection.nodeId,
            sourceHandle: pendingConnection.handleId || null,
            target: newNodeId,
            targetHandle: 'left',
            animated: true,
            style: { stroke: '#9CA3AF', strokeWidth: 2 },
            type: 'smoothstep',
          },
          eds
        )
      );
    }

    setMenuPos(null);
    setPendingConnection(null);
  };

  const handleSaveLayout = () => {
    setIsSaving(true);
    setTimeout(() => {
      updateJourney(journey.id, { nodes, edges });
      setIsSaving(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    }, 300);
  };

  const addStepNode = () => {
    const stepCount = nodes.filter((n) => n.type === 'journeyStepNode').length;
    const newNode: Node = {
      id: `step-${Date.now()}`,
      type: 'journeyStepNode',
      position: { x: 100, y: 100 },
      data: { label: `Step ${stepCount + 1}`, description: '', rectangles: [] },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const addTriggerNode = () => {
    const newNode: Node = {
      id: `trigger-${Date.now()}`,
      type: 'triggerNode',
      position: { x: 400, y: 100 },
      data: { description: '', connectedEvent: null },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const addNoteNode = () => {
    const newNode: Node = {
      id: `note-${Date.now()}`,
      type: 'noteNode',
      position: { x: 200, y: 50 },
      data: { text: '' },
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const addHighlightNode = () => {
    const newNode: Node = {
      id: `highlight-${Date.now()}`,
      type: 'highlightNode',
      position: { x: 200, y: 50 },
      style: { width: 250, height: 150 },
      data: {},
    };
    setNodes((nds) => nds.concat(newNode));
  };

  const onNodeClick = (_e: React.MouseEvent, node: Node) => {
    if (activeQARunId && (node.type === 'journeyStepNode' || node.type === 'triggerNode')) {
      setSelectedNodeId(node.id);
    }
  };

  const activeQARun = (journey.qaRuns || []).find((r: QARun) => r.id === activeQARunId);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId);
  const currentVerification =
    activeQARun && selectedNode ? (activeQARun.verifications || {})[selectedNode.id] : null;

  const updateQAVerification = (nodeId: string, updates: Partial<any>) => {
    if (!activeQARunId) return;

    const node = nodes.find((n) => n.id === nodeId);
    const tempProofUrl = node?.data?.tempProofUrl;

    const updatedRuns = (journey.qaRuns || []).map((run: QARun) => {
      if (run.id !== activeQARunId) return run;

      const existingVerif = (run.verifications || {})[nodeId] || { nodeId, status: 'Pending' };

      return {
        ...run,
        verifications: {
          ...(run.verifications || {}),
          [nodeId]: {
            ...existingVerif,
            ...updates,
            ...(tempProofUrl ? { proofUrl: tempProofUrl } : {}),
          },
        },
      };
    });

    updateJourney(journey.id, { qaRuns: updatedRuns });

    if (tempProofUrl) {
      setNodes((nds) =>
        nds.map((n) =>
          n.id === nodeId ? { ...n, data: { ...n.data, tempProofUrl: undefined } } : n
        )
      );
    }
  };

  const prettyFormatJson = () => {
    if (!selectedNode || selectedNode.type !== 'triggerNode') return;
    const current = currentVerification?.proofText || '';
    if (!current.trim()) return;

    try {
      const parsed = JSON.parse(current);
      updateQAVerification(selectedNode.id, { proofText: JSON.stringify(parsed, null, 2) });
    } catch {
      alert('Invalid JSON. Fix the payload before formatting.');
    }
  };

  const sampleTriggerPayload = useMemo(
    () => `{
  "event_type": "double_opt_in",

  "customer_ids": {
    "email_id": "jan.pan@e3-services.com"
  },

  "properties": {
    "email": "<value>",
    "first_name": "<value>",
    "is_changemaker": <value>,
    "action": "<value>",
    "country_code": "<value>",
    "language_code": "<value>",
    "language_tag": "<value>",
    "placement": "<value>",
    "message": "<value>",
    "newsletter_interest": "<value>",
    "voucher_code": "<value>",
    "birth_date": <value>,
    "location": "<value>"
  }
}`,
    []
  );

  const activeVerifications = (journey.qaRuns?.find((r: any) => r.id === activeQARunId)?.verifications ||
    {}) as Record<string, any>;

  return (
    <div className="flex h-full w-full">
      {!activeQARunId && (
        <div className="w-64 border-r bg-gray-50 flex flex-col p-4 space-y-6">
          <div>
            <h3 className="font-semibold text-sm text-gray-900">Journey Nodes</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">Add nodes to build your tracking journey.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={addStepNode}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white border rounded shadow-sm hover:border-gray-400 transition-colors text-left text-gray-700"
              >
                <ImageIcon className="w-4 h-4 text-gray-500" />
                <span className="font-medium">Add Step Node</span>
              </button>
              <button
                onClick={addTriggerNode}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-white border rounded shadow-sm hover:border-amber-400 transition-colors text-left text-gray-700"
              >
                <Zap className="w-4 h-4 text-amber-500" />
                <span className="font-medium">Add Trigger Node</span>
              </button>
            </div>
          </div>

          <div>
            <h3 className="font-semibold text-sm text-gray-900">Annotations</h3>
            <p className="text-xs text-gray-500 mt-1 mb-3">Add global notes and highlights.</p>
            <div className="flex flex-col gap-2">
              <button
                onClick={addNoteNode}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-yellow-50 border border-yellow-200 rounded shadow-sm hover:border-yellow-400 transition-colors text-left text-yellow-900"
              >
                <StickyNote className="w-4 h-4 text-yellow-600" />
                <span className="font-medium">Add Sticky Note</span>
              </button>
              <button
                onClick={addHighlightNode}
                className="flex items-center gap-2 px-3 py-2 text-sm bg-blue-50 border border-blue-200 rounded shadow-sm hover:border-blue-400 transition-colors text-left text-blue-900"
              >
                <SquareDashed className="w-4 h-4 text-blue-600" />
                <span className="font-medium">Add Highlight Box</span>
              </button>
            </div>
          </div>

          <div className="mt-auto p-4 bg-blue-50 rounded-lg border border-blue-100">
            <h4 className="text-sm font-semibold text-blue-900 mb-1">Tips</h4>
            <ul className="text-xs text-blue-800 space-y-2 list-disc pl-4">
              <li>Use the <strong>+</strong> button next to node handles to instantly build flows.</li>
              <li>Select a node or edge and press <strong>Backspace</strong> to delete.</li>
              <li>Use <strong>Draw Annotation</strong> inside step nodes to highlight UI elements.</li>
            </ul>
          </div>
        </div>
      )}

      <div className="flex-1 relative">
        {activeQARunId && (
          <div className="absolute top-4 left-4 z-10 bg-white border-2 border-blue-400 rounded-lg shadow-md p-3 flex flex-col gap-2 pointer-events-none">
            <div className="flex items-center gap-2 text-blue-700 font-bold">
              <CheckSquare className="w-5 h-5" />
              QA Mode Active
            </div>
            <div className="text-xs text-gray-600">
              Run: {journey.qaRuns?.find((r: any) => r.id === activeQARunId)?.name}
            </div>
            <div className="flex items-center gap-3 text-xs mt-1">
              <div className="flex items-center gap-1 text-gray-500">
                <span className="font-semibold">
                  {nodes.filter((n) => n.type === 'journeyStepNode' || n.type === 'triggerNode').length}
                </span>{' '}
                Nodes
              </div>
              <div className="flex items-center gap-1 text-emerald-600">
                <CheckCircle2 className="w-3 h-3" />
                <span className="font-semibold">
                  {Object.values(activeVerifications).filter((v: any) => v.status === 'Passed').length}
                </span>
              </div>
              <div className="flex items-center gap-1 text-red-600">
                <X className="w-3 h-3" />
                <span className="font-semibold">
                  {Object.values(activeVerifications).filter((v: any) => v.status === 'Failed').length}
                </span>
              </div>
            </div>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onConnectStart={onConnectStart}
          onConnectEnd={onConnectEnd}
          onPaneClick={() => {
            setMenuPos(null);
            setPendingConnection(null);
          }}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          className="bg-[#F9FAFB]"
          nodesDraggable={!activeQARunId}
          nodesConnectable={!activeQARunId}
          elementsSelectable={true}
          deleteKeyCode={['Backspace', 'Delete']}
        >
          <Controls />
          <MiniMap nodeColor="#3E52FF" maskColor="rgba(249, 250, 251, 0.7)" />
          <Background gap={16} size={1} color="#E5E7EB" />
        </ReactFlow>

        {!activeQARunId && (
          <div className="absolute top-4 right-4 z-10">
            <Button
              onClick={handleSaveLayout}
              disabled={isSaving}
              className="gap-2 shadow-md bg-white text-gray-900 hover:bg-gray-50 border transition-all w-[140px]"
            >
              {isSaving ? (
                <div className="w-4 h-4 border-2 border-gray-400 border-t-gray-900 rounded-full animate-spin" />
              ) : saveSuccess ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <Save className="w-4 h-4" />
              )}
              {isSaving ? 'Saving...' : saveSuccess ? 'Saved!' : 'Save Layout'}
            </Button>
          </div>
        )}

        {menuPos && (
          <div
            className="fixed z-50 bg-white border rounded-lg shadow-xl p-2 flex flex-col gap-1 w-48"
            style={{ left: menuPos.x, top: menuPos.y }}
          >
            <button
              onClick={() => handleAddConnectedNode('journeyStepNode')}
              className="flex items-center gap-2 px-2 py-2 text-sm hover:bg-gray-50 rounded text-left"
            >
              <ImageIcon className="w-4 h-4 text-gray-500" />
              <span className="font-medium text-gray-700">Add Step</span>
            </button>
            <button
              onClick={() => handleAddConnectedNode('triggerNode')}
              className="flex items-center gap-2 px-2 py-2 text-sm hover:bg-amber-50 rounded text-left"
            >
              <Zap className="w-4 h-4 text-amber-500" />
              <span className="font-medium text-gray-700">Add Trigger</span>
            </button>
          </div>
        )}
      </div>

      {activeQARunId &&
        selectedNode &&
        (selectedNode.type === 'journeyStepNode' || selectedNode.type === 'triggerNode') && (
          <div className="w-[380px] border-l bg-white flex flex-col shadow-xl z-20 absolute right-0 top-0 bottom-0">
            <div className="p-4 border-b bg-gray-50 flex items-center justify-between">
              <h3 className="font-bold text-gray-900 flex items-center gap-2">
                <CheckSquare className="w-5 h-5 text-[#3E52FF]" /> QA Verification
              </h3>
              <button onClick={() => setSelectedNodeId(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 flex-1 overflow-y-auto space-y-6">
              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Node Details
                </div>
                <div className="bg-gray-50 p-3 rounded border text-sm">
                  <div className="font-medium text-gray-900 mb-1">
                    {(selectedNode.data.label as string) || 'Trigger Node'}
                  </div>
                  {selectedNode.type === 'triggerNode' && selectedNode.data.connectedEvent && (
                    <div className="text-gray-600">Event: {(selectedNode.data.connectedEvent as any).name}</div>
                  )}
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Verification Status
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={currentVerification?.status === 'Passed' ? 'default' : 'outline'}
                    className={
                      currentVerification?.status === 'Passed'
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white w-full'
                        : 'w-full'
                    }
                    onClick={() => updateQAVerification(selectedNode.id, { status: 'Passed' })}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-2" /> Pass
                  </Button>
                  <Button
                    size="sm"
                    variant={currentVerification?.status === 'Failed' ? 'default' : 'outline'}
                    className={
                      currentVerification?.status === 'Failed'
                        ? 'bg-red-500 hover:bg-red-600 text-white w-full'
                        : 'w-full'
                    }
                    onClick={() => updateQAVerification(selectedNode.id, { status: 'Failed' })}
                  >
                    <X className="w-4 h-4 mr-2" /> Fail
                  </Button>
                </div>
              </div>

              <div>
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">QA Notes</div>
                <textarea
                  className="w-full h-28 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  placeholder="Add notes about the test execution..."
                  value={currentVerification?.notes || ''}
                  onChange={(e) => updateQAVerification(selectedNode.id, { notes: e.target.value })}
                />
              </div>

              {selectedNode.type === 'triggerNode' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                      Trigger Proof Payload
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          updateQAVerification(selectedNode.id, {
                            proofText: currentVerification?.proofText || sampleTriggerPayload,
                          })
                        }
                      >
                        Insert Sample
                      </Button>
                      <Button size="sm" variant="outline" onClick={prettyFormatJson}>
                        Format JSON
                      </Button>
                    </div>
                  </div>

                  <textarea
                    className="w-full h-72 rounded-md border border-input bg-background px-3 py-2 text-xs font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    placeholder="Paste your payload JSON here..."
                    value={currentVerification?.proofText || ''}
                    onChange={(e) =>
                      updateQAVerification(selectedNode.id, {
                        proofText: e.target.value,
                      })
                    }
                  />

                  <div className="text-[11px] text-gray-500">
                    You can paste raw JSON here directly for tester confirmation. This is stored on the QA run,
                    not on the base journey.
                  </div>
                </div>
              )}

              {selectedNode.data.tempProofUrl && (
                <Button
                  className="w-full bg-[#3E52FF] hover:bg-blue-600 text-white"
                  onClick={() => updateQAVerification(selectedNode.id, {})}
                >
                  Save Uploaded Proof
                </Button>
              )}

              {currentVerification?.proofUrl && (
                <div className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-3">
                  Saved proof attached to this QA verification.
                </div>
              )}
            </div>
          </div>
        )}
    </div>
  );
}
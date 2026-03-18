import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useReactFlow, NodeProps } from '@xyflow/react';
import { Image as ImageIcon, UploadCloud, CheckCircle2, ExternalLink } from 'lucide-react';

import {
  JourneyStepFlowNode,
  JourneyFlowNode,
  JourneyFlowEdge,
  JourneyStepNodeData,
  isJourneyStepNode,
  JourneyStepActionType,
  JOURNEY_STEP_ACTION_TYPES,
  ImplementationType,
  IMPLEMENTATION_TYPES,
} from '@/src/features/journeys/nodes/types';
import { buildProofFromFile } from '@/src/features/journeys/lib/proofs';
import { uploadJourneyStepImage } from '@/src/features/journeys/lib/journeyImageStorage';
import { StrictHandles, QAStatusBadge } from '@/src/features/journeys/nodes/NodeHandles';
import { JourneyQuickAddMenu } from '@/src/features/journeys/overlays/JourneyQuickAddMenu';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';

export const JourneyStepNode = ({ id, data }: NodeProps<JourneyStepFlowNode>) => {
  const { setNodes } = useReactFlow<JourneyFlowNode, JourneyFlowEdge>();
  const [resolvedImageSrc, setResolvedImageSrc] = useState<string | null>(null);
  const [imgError, setImgError] = useState(false);

  const isQAMode = !!data.activeQARunId;
  const isReadOnly = !!(data as JourneyStepNodeData & { readOnly?: boolean }).readOnly;
  const qaStatus = data.qaVerification?.status || 'Pending';
  const pendingProofs = data.pendingProofs || [];
  const disabled = isQAMode || isReadOnly;

  const rawImageUrl = typeof data.imageUrl === 'string' ? data.imageUrl.trim() : '';
  const needsAuthedFetch = useMemo(() => rawImageUrl.startsWith('/api/'), [rawImageUrl]);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setImgError(false);

    if (!rawImageUrl) {
      setResolvedImageSrc(null);
      return () => {};
    }

    if (!needsAuthedFetch) {
      setResolvedImageSrc(rawImageUrl);
      return () => {};
    }

    // Legacy/private proxy URLs can't be loaded by <img> because they require auth and headers.
    // Fetch with auth and convert to a blob URL.
    const workspaceId = (data as JourneyStepNodeData & { workspaceId?: string }).workspaceId;
    if (!workspaceId) {
      setResolvedImageSrc(rawImageUrl);
      return () => {};
    }

    fetchWithAuth(`${API_BASE}${rawImageUrl}`, {
      method: 'GET',
      headers: { 'x-workspace-id': workspaceId },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`Image fetch failed (${res.status})`);
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        if (!cancelled) setResolvedImageSrc(objectUrl);
      })
      .catch(() => {
        if (!cancelled) {
          setResolvedImageSrc(rawImageUrl);
          setImgError(true);
        }
      });

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [rawImageUrl, needsAuthedFetch, data]);

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
    if (disabled) return;

    const file = e.target.files?.[0];
    if (!file) return;

    const journeyId = (data as JourneyStepNodeData & { journeyId?: string }).journeyId;
    if (!journeyId) {
      // Fallback (shouldn't happen): keep old behavior.
      const reader = new FileReader();
      reader.onload = (event) => {
        const imageUrl = event.target?.result as string;
        updateNodeData({ imageUrl });
      };
      reader.readAsDataURL(file);
      return;
    }

    const workspaceId = (data as JourneyStepNodeData & { workspaceId?: string }).workspaceId;
    if (!workspaceId) {
      alert('Workspace context missing. Please refresh and try again.');
      return;
    }

    uploadJourneyStepImage({ journeyId, nodeId: id, file, workspaceId }).then((result) => {
      if (!result.success) {
        alert(result.error ?? 'Failed to upload image');
        return;
      }
      updateNodeData({ imageUrl: result.url });
    });
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
            const journeyId = (data as JourneyStepNodeData & { journeyId?: string }).journeyId;
            if (!journeyId) {
              const reader = new FileReader();
              reader.onload = (event) => {
                const imageUrl = event.target?.result as string;
                updateNodeData({ imageUrl });
              };
              reader.readAsDataURL(file);
            } else {
              const workspaceId = (data as JourneyStepNodeData & { workspaceId?: string }).workspaceId;
              if (!workspaceId) {
                alert('Workspace context missing. Please refresh and try again.');
                continue;
              }
              const result = await uploadJourneyStepImage({ journeyId, nodeId: id, file, workspaceId });
              if (!result.success) {
                alert(result.error ?? 'Failed to upload image');
              } else {
                updateNodeData({ imageUrl: result.url });
              }
            }
          }

          e.preventDefault();
          break;
        }
      }
    },
    [isQAMode, pendingProofs, updateNodeData, data, id],
  );

  const implType = data.implementationType ?? 'new';
  const badgeStyle = {
    new: 'bg-emerald-600 text-white',
    enrichment: 'bg-blue-600 text-white',
    fix: 'bg-amber-600 text-white',
  }[implType];
  const badgeLabel = { new: 'New', enrichment: 'Enrichment', fix: 'Fix' }[implType];

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
      <div className={`rounded-t-md px-2 py-1 text-[10px] font-bold uppercase tracking-wider ${badgeStyle}`}>
        {!disabled ? (
          <select
            value={implType}
            onChange={(e) =>
              updateNodeData({ implementationType: (e.target.value || 'new') as ImplementationType })
            }
            className="w-full bg-transparent border-none text-inherit font-bold uppercase cursor-pointer focus:ring-0 p-0 nodrag"
          >
            {IMPLEMENTATION_TYPES.map((t) => (
              <option key={t} value={t} className="text-gray-900">
                {{ new: 'New', enrichment: 'Enrichment', fix: 'Fix' }[t]}
              </option>
            ))}
          </select>
        ) : (
          <span>{badgeLabel}</span>
        )}
      </div>
      {isQAMode && <QAStatusBadge status={qaStatus} />}
      <StrictHandles color="bg-gray-400" isQAMode={isQAMode} />
      {!isQAMode && !isReadOnly && <JourneyQuickAddMenu nodeId={id} position="right" />}

      <div className="bg-gray-50 px-3 py-2 border-b flex flex-col gap-2 rounded-t-lg">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          <ImageIcon className="w-4 h-4" />
          <input
            type="text"
            value={data.label}
            onChange={(e) =>
              !disabled && updateNodeData({ label: e.target.value })
            }
            disabled={disabled}
            className="bg-transparent border-none focus:ring-0 p-0 font-semibold text-gray-700 w-full"
          />
        </div>

        {isReadOnly ? (
          <div className="w-full text-xs text-gray-700 bg-white border rounded p-2 min-h-[3.5rem] whitespace-pre-wrap">
            {(data.description ?? '').trim() ? data.description : '—'}
          </div>
        ) : (
          <textarea
            placeholder="Step Description..."
            value={data.description}
            onChange={(e) =>
              !disabled && updateNodeData({ description: e.target.value })
            }
            disabled={disabled}
            className="w-full text-xs text-gray-600 bg-white border rounded p-1 resize-none h-16 disabled:bg-gray-50 nodrag"
          />
        )}

        {isReadOnly ? (
          (data.url ?? '').trim() ? (
            <a
              href={data.url!.trim()}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-1 flex items-center justify-between gap-2 text-xs text-[var(--color-info)] bg-white border rounded px-2 py-1.5 nodrag hover:underline"
              title="Open step URL"
            >
              <span className="truncate">{data.url!.trim()}</span>
              <ExternalLink className="w-4 h-4 shrink-0" />
            </a>
          ) : (
            <div className="mt-1 text-[10px] text-gray-400">No URL</div>
          )
        ) : (
          <div className="flex items-center gap-2 mt-1">
            <input
              type="url"
              placeholder="Step URL (for testing)"
              value={data.url ?? ''}
              onChange={(e) =>
                !disabled && updateNodeData({ url: e.target.value || undefined })
              }
              disabled={disabled}
              className="flex-1 min-w-0 text-xs text-gray-600 bg-white border rounded px-2 py-1.5 disabled:bg-gray-50 nodrag"
            />
            {data.url?.trim() && (
              <a
                href={data.url.trim()}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 p-1.5 rounded text-blue-600 hover:bg-blue-50 transition-colors nodrag"
                title="Open step URL"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        )}

        {!isQAMode && (
          <div className="mt-2 pt-2 border-t border-gray-200 space-y-1.5">
            {isReadOnly ? (
              <>
                <div className="text-[10px] text-gray-500 uppercase font-medium">Action</div>
                <div className="text-xs text-gray-700">{data.actionType ?? 'click'}</div>
                {(data.targetElement ?? '').trim() && (
                  <>
                    <div className="text-[10px] text-gray-500 uppercase font-medium mt-1">Target element</div>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all bg-gray-50 p-1.5 rounded">{data.targetElement}</pre>
                  </>
                )}
                {(data.testDataJson ?? '').trim() && (
                  <>
                    <div className="text-[10px] text-gray-500 uppercase font-medium mt-1">Test data</div>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap break-all bg-gray-50 p-1.5 rounded">{data.testDataJson}</pre>
                  </>
                )}
              </>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500 uppercase font-medium w-16 shrink-0">
                    Action
                  </span>
                  <select
                    value={data.actionType ?? 'click'}
                    onChange={(e) =>
                      updateNodeData({
                        actionType: (e.target.value || 'click') as JourneyStepActionType,
                      })
                    }
                    className="flex-1 min-w-0 text-xs text-gray-700 bg-white border rounded px-2 py-1 nodrag"
                  >
                    {JOURNEY_STEP_ACTION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <span className="block text-[10px] text-gray-500 uppercase font-medium">
                    Target Element (HTML snippet or CSS Selector)
                  </span>
                  <textarea
                    placeholder="Paste HTML or e.g. [data-testid=submit]"
                    value={data.targetElement ?? ''}
                    onChange={(e) =>
                      updateNodeData({ targetElement: e.target.value || undefined })
                    }
                    rows={4}
                    className="w-full text-xs text-gray-600 bg-white border rounded px-2 py-1.5 resize-y min-h-[4rem] nodrag"
                  />
                  <p className="text-[10px] text-gray-400 leading-tight">
                    💡 Tip for non-technical users: Go to the live website, right-click the button &gt; Inspect &gt; Right-click the highlighted code in DevTools &gt; Copy &gt; Copy element. Paste that exact HTML here.
                  </p>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-[10px] text-gray-500 uppercase font-medium w-16 shrink-0 pt-1">
                    Test data
                  </span>
                  <textarea
                    placeholder='Optional JSON e.g. {"value": "hello"}'
                    value={data.testDataJson ?? ''}
                    onChange={(e) =>
                      updateNodeData({ testDataJson: e.target.value || undefined })
                    }
                    rows={2}
                    className="flex-1 min-w-0 text-xs text-gray-600 bg-white border rounded px-2 py-1 resize-none nodrag"
                  />
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <div className="relative p-2">
        {rawImageUrl ? (
          <div className="relative inline-block w-full select-none">
            <img
              src={resolvedImageSrc ?? rawImageUrl}
              alt="Step"
              className="w-full h-auto rounded border"
              draggable={false}
              loading="lazy"
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
            />
            {imgError && (
              <div className="mt-1 text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1">
                Image failed to load in canvas. If this is an older journey, re-upload the screenshot to migrate it to a public Storage URL.
              </div>
            )}
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
              disabled={disabled}
            />
          </label>
        )}
      </div>

      {isQAMode && !isReadOnly && (
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


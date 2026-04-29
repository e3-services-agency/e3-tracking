/**
 * Public read-only journey view at /share/:token.
 * Fetches journey from GET /api/shared/journeys/:token and renders JourneyCanvas with readOnly.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { JourneyCanvas } from '@/src/features/journeys/editor/JourneyCanvas';
import { getSharedJourneyByIdApi, getSharedJourneyByTokenApi } from '@/src/features/journeys/hooks/useJourneysApi';
import type { Journey } from '@/src/types';
import { API_BASE, buildAppPageUrl } from '@/src/config/env';
import { computeQARunStatusForRun, getQARunDisplayName } from '@/src/features/journeys/lib/qaRunUtils';
import { injectQaOverlayIntoExportHtml } from '@/src/lib/qaOverlayInjection';
import { ArrowLeft, Check, ChevronDown, Download, FileText, Lock, LockOpen, PenTool } from 'lucide-react';
import type { QARun, QAStatus } from '@/src/types';

type SharedResponse = {
  id: string;
  name: string;
  description: string | null;
  testing_instructions_markdown: string | null;
  codegen_preferred_style?: 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi' | null;
  nodes: unknown;
  edges: unknown;
  eventSnippets?: Record<
    string,
    { eventName: string; snippets: { dataLayer: string; bloomreachSdk: string; bloomreachApi: string } }
  >;
};


/**
 * Wrap every `<img>` in the export HTML in `<a target="_blank" rel="noopener" href="<src>">`
 * so that small images become clickable links to the original (typically a public
 * Supabase Storage URL produced by the upload route). Skip images that are already
 * inside an `<a>` to avoid double-wrapping. Also upgrade QA proof `<button>.qa-proof-thumb`
 * elements to `<a>` so the click works inside the static export and PDF.
 *
 * Operates on a DOMParser document and serializes back, which keeps the rest of
 * the export stylesheet/script intact (the head + body remain untouched).
 */
function wrapExportImagesInAnchors(html: string): string {
  if (typeof window === 'undefined' || typeof DOMParser === 'undefined') return html;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch (parseErr) {
    console.warn('[shared-docs] wrapExportImagesInAnchors: parse failed; returning input', parseErr);
    return html;
  }
  if (!doc?.body) return html;

  // QA proof thumbs are <button>; convert them to <a> so PDF readers preserve the
  // link. They are emitted by injectQaOverlayIntoExportHtml above.
  const qaButtons = doc.querySelectorAll('button.qa-proof-thumb');
  for (let i = 0; i < qaButtons.length; i += 1) {
    const btn = qaButtons[i] as HTMLButtonElement;
    const innerImg = btn.querySelector('img');
    const href = innerImg?.getAttribute('src') ?? '';
    if (!href) continue;
    const a = doc.createElement('a');
    a.className = btn.className;
    a.setAttribute('href', href);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    while (btn.firstChild) a.appendChild(btn.firstChild);
    btn.parentNode?.replaceChild(a, btn);
  }

  const imgs = doc.querySelectorAll('img');
  for (let i = 0; i < imgs.length; i += 1) {
    const img = imgs[i] as HTMLImageElement;
    const src = img.getAttribute('src') ?? '';
    if (!src) continue;
    if (img.closest('a')) continue;
    const a = doc.createElement('a');
    a.setAttribute('href', src);
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
    a.setAttribute('data-export-image-link', '1');
    img.parentNode?.replaceChild(a, img);
    a.appendChild(img);
  }

  return `<!DOCTYPE html>\n${doc.documentElement.outerHTML}`;
}

/**
 * Stack one or more QA-run overlays into the docs HTML for export. Each call to
 * `injectQaOverlayIntoExportHtml` self-contains its own styles + DOM; running it
 * sequentially merges them, with a section divider added per run for readability.
 */
function buildHtmlWithAllQaRuns(baseHtml: string, qaRuns: QARun[]): string {
  if (!qaRuns || qaRuns.length === 0) return baseHtml;
  let out = baseHtml;
  for (const run of qaRuns) {
    if (!run) continue;
    out = injectQaOverlayIntoExportHtml(out, run);
  }
  return out;
}

/** Triggers a Blob-based file download (HTML export). Safe no-op outside the browser. */
function downloadHtmlBlob(html: string, filename: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

type ExportFormat = 'html' | 'pdf';

/**
 * Modal that lets readers download the shared docs as HTML or PDF and pick whether
 * to include Docs / QA Runs. All work happens in the browser; the only network
 * call is the existing public docs endpoint
 * `GET /api/shared/journeys/journey/:id/export/html`.
 */
function ExportShareDocModal({
  open,
  onClose,
  journeyId,
  journeyName,
  qaRuns,
}: {
  open: boolean;
  onClose: () => void;
  journeyId: string;
  journeyName: string;
  qaRuns: QARun[];
}): React.ReactElement | null {
  const [format, setFormat] = useState<ExportFormat>('html');
  const [includeDocs, setIncludeDocs] = useState(true);
  const [includeQa, setIncludeQa] = useState(false);
  const [isWorking, setIsWorking] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const hasQaRuns = qaRuns.length > 0;

  React.useEffect(() => {
    if (!open) return;
    setFormat('html');
    setIncludeDocs(true);
    setIncludeQa(hasQaRuns);
    setIsWorking(false);
    setErrorMsg(null);
  }, [open, hasQaRuns]);

  const allSelected = includeDocs && (includeQa || !hasQaRuns);
  const nothingSelected = !includeDocs && !includeQa;

  const onToggleSelectAll = () => {
    const next = !allSelected;
    setIncludeDocs(next);
    setIncludeQa(next && hasQaRuns);
  };

  const onConfirm = async () => {
    if (nothingSelected) return;
    setIsWorking(true);
    setErrorMsg(null);
    const safeName = (journeyName || 'shared-journey').replace(/[\\/:*?"<>|]/g, '-').slice(0, 80);
    try {
      // PDF branch: server-side Puppeteer renders the same HTML used for the
      // download path, applies header/footer/cover, and streams a PDF blob
      // back. We do nothing on the client beyond download — keeps the visual
      // output deterministic across browsers and matches the HTML look exactly.
      if (format === 'pdf') {
        const res = await fetch(
          `${API_BASE}/api/shared/journeys/journey/${journeyId}/export/pdf`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              includeDocs,
              qaRunIds: includeQa ? qaRuns.map((r) => r.id) : [],
            }),
          }
        );
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const code = typeof (body as any)?.code === 'string' ? (body as any).code : '';
          if (code === 'PDF_DISABLED') {
            throw new Error(
              'PDF export is not available in this environment. Please use the HTML option instead.'
            );
          }
          const msg =
            typeof (body as any)?.error === 'string'
              ? (body as any).error
              : res.statusText || 'Failed to generate PDF';
          throw new Error(msg);
        }
        const blob = await res.blob();
        if (typeof window !== 'undefined' && typeof document !== 'undefined') {
          const url = URL.createObjectURL(blob);
          try {
            const a = document.createElement('a');
            a.href = url;
            a.download = `${safeName}.pdf`;
            document.body.appendChild(a);
            a.click();
            a.remove();
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        onClose();
        return;
      }

      // HTML branch (unchanged): fetch docs HTML, stack QA overlays in the
      // browser via the shared `injectQaOverlayIntoExportHtml`, then download
      // as a blob.
      const res = await fetch(`${API_BASE}/api/shared/journeys/journey/${journeyId}/export/html`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const msg =
          typeof (body as any)?.error === 'string'
            ? (body as any).error
            : res.statusText || 'Failed to load export';
        throw new Error(msg);
      }
      let html = await res.text();

      if (includeQa && hasQaRuns) {
        html = buildHtmlWithAllQaRuns(html, qaRuns);
      }

      // When Docs is unchecked but QA Runs is checked, hide the docs-only blocks
      // so the export only shows step structure + QA evidence. Stylesheet lives
      // in the export service.
      if (!includeDocs && includeQa) {
        const bodyClassRegex = /<body([^>]*)>/i;
        const bodyMatch = html.match(bodyClassRegex);
        if (bodyMatch) {
          const attrs = bodyMatch[1] || '';
          const hasClass = /\bclass=/i.test(attrs);
          const newAttrs = hasClass
            ? attrs.replace(/\bclass=("|')([^"']*)("|')/i, (_m, q1, val, q3) => `class=${q1}${val} export-mode-qa-only${q3}`)
            : `${attrs} class="export-mode-qa-only"`;
          html = html.replace(bodyClassRegex, `<body${newAttrs}>`);
        }
      }

      html = wrapExportImagesInAnchors(html);

      downloadHtmlBlob(html, `${safeName}.html`);
      onClose();
    } catch (e) {
      console.error('[shared-docs] export failed', e);
      setErrorMsg(e instanceof Error ? e.message : 'Export failed.');
    } finally {
      setIsWorking(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-share-doc-title"
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isWorking) onClose();
      }}
    >
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-200">
          <h2 id="export-share-doc-title" className="text-base font-semibold text-gray-900">
            Export shared docs
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Download a self-contained HTML file or print to PDF. Journey design is not exportable.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          <fieldset>
            <legend className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Format
            </legend>
            <div className="flex gap-2">
              <label className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-sm flex items-center gap-2 ${format === 'html' ? 'border-[var(--color-info)] bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="export-format"
                  value="html"
                  checked={format === 'html'}
                  onChange={() => setFormat('html')}
                  className="accent-[var(--color-info)]"
                />
                <span className="font-medium">HTML</span>
              </label>
              <label className={`flex-1 cursor-pointer rounded-md border px-3 py-2 text-sm flex items-center gap-2 ${format === 'pdf' ? 'border-[var(--color-info)] bg-blue-50' : 'border-gray-200 hover:bg-gray-50'}`}>
                <input
                  type="radio"
                  name="export-format"
                  value="pdf"
                  checked={format === 'pdf'}
                  onChange={() => setFormat('pdf')}
                  className="accent-[var(--color-info)]"
                />
                <span className="font-medium">PDF</span>
              </label>
            </div>
            {format === 'pdf' && (
              <p className="text-[11px] text-gray-500 mt-1.5">
                Generates a polished PDF on the server with cover page, page numbers, and
                full-width tables. May take a few seconds for large exports.
              </p>
            )}
          </fieldset>

          <fieldset>
            <legend className="text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
              Include
            </legend>
            <label className="flex items-center gap-2 text-sm py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={allSelected}
                onChange={onToggleSelectAll}
                className="accent-[var(--color-info)]"
              />
              <span className="font-medium text-gray-900">Select all</span>
            </label>
            <div className="border-t border-gray-100 my-1" />
            <label className="flex items-center gap-2 text-sm py-1 cursor-pointer">
              <input
                type="checkbox"
                checked={includeDocs}
                onChange={(e) => setIncludeDocs(e.target.checked)}
                className="accent-[var(--color-info)]"
              />
              <span>Docs</span>
            </label>
            <label
              className={`flex items-center gap-2 text-sm py-1 ${hasQaRuns ? 'cursor-pointer' : 'opacity-50 cursor-not-allowed'}`}
            >
              <input
                type="checkbox"
                checked={includeQa}
                disabled={!hasQaRuns}
                onChange={(e) => setIncludeQa(e.target.checked)}
                className="accent-[var(--color-info)]"
              />
              <span>QA Runs{hasQaRuns ? ` (${qaRuns.length})` : ' (none yet)'}</span>
            </label>
          </fieldset>

          {errorMsg && (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {errorMsg}
            </div>
          )}
        </div>

        <div className="px-5 py-3 border-t border-gray-200 flex items-center justify-end gap-2">
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md border border-gray-200 bg-white hover:bg-gray-50 disabled:opacity-50"
            onClick={onClose}
            disabled={isWorking}
          >
            Cancel
          </button>
          <button
            type="button"
            className="px-3 py-1.5 text-sm rounded-md bg-[var(--color-info)] text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={() => void onConfirm()}
            disabled={isWorking || nothingSelected}
          >
            {isWorking ? (format === 'pdf' ? 'Generating PDF…' : 'Exporting…') : 'Export'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function SharedJourneyView({
  token,
  journeyId,
}: {
  token?: string;
  journeyId?: string;
}) {
  const [journey, setJourney] = useState<Journey | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'journey' | 'brief' | 'qa'>(() => {
    if (typeof window === 'undefined') return 'journey';
    const params = new URL(window.location.href).searchParams;
    const v = params.get('view');
    if (v === 'brief') return 'brief';
    if (v === 'qa') return 'qa';
    if (v === 'journey') return 'journey';
    if (params.get('hub')) return 'brief';
    return 'journey';
  });
  const [activeQARunId, setActiveQARunId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return new URL(window.location.href).searchParams.get('qa') || null;
  });
  const [briefHtml, setBriefHtml] = useState<string | null>(null);
  const [briefError, setBriefError] = useState<string | null>(null);
  const [briefLoading, setBriefLoading] = useState(false);
  const [qaBriefHtml, setQaBriefHtml] = useState<string | null>(null);
  const [qaBriefError, setQaBriefError] = useState<string | null>(null);
  const [qaBriefLoading, setQaBriefLoading] = useState(false);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const modeMenuRef = React.useRef<HTMLDivElement | null>(null);
  const docsIframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const qaIframeRef = React.useRef<HTMLIFrameElement | null>(null);
  const [sharedHubReturnToken] = useState(() =>
    typeof window !== 'undefined' ? new URL(window.location.href).searchParams.get('hub') : null,
  );
  const sortedQARuns = useMemo(() => {
    const runs = journey?.qaRuns || [];
    // #region agent log
    fetch('http://127.0.0.1:7313/ingest/1269dbcd-5a29-41de-8a60-39fdeb125f13',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ecaf3'},body:JSON.stringify({sessionId:'2ecaf3',runId:'pre-fix',hypothesisId:'H4',location:'SharedJourneyView.tsx:sortedQARuns',message:'computed qa runs list for mode menu',data:{journeyId:journey?.id??null,inputRunsCount:Array.isArray(runs)?runs.length:-1,inputRunIds:Array.isArray(runs)?runs.map((r:any)=>r?.id):[],view},timestamp:Date.now()})}).catch(()=>{});
    // #endregion
    return [...runs].sort((a: any, b: any) => {
      const ta = new Date(a?.createdAt || 0).getTime();
      const tb = new Date(b?.createdAt || 0).getTime();
      return tb - ta;
    });
  }, [journey?.qaRuns]);

  /** Stable fingerprint so QA export HTML does not refetch when `journey` identity changes without run data changes (e.g. focus refetch). */
  const activeQARunSerialized = useMemo(() => {
    if (!journey?.qaRuns || !activeQARunId) return null;
    const run = journey.qaRuns.find((r: any) => r?.id === activeQARunId) as QARun | undefined;
    return run ? JSON.stringify(run) : null;
  }, [journey?.qaRuns, activeQARunId, journey?.id]);

  const inFlightRef = React.useRef(false);
  const fetchSharedJourney = React.useCallback(
    async ({ showLoadingScreen }: { showLoadingScreen: boolean }) => {
      if (inFlightRef.current) return;
      inFlightRef.current = true;
      let cancelled = false;
      try {
        if (showLoadingScreen) {
          setLoading(true);
          setError(null);
        }
        const fetcher = journeyId
          ? getSharedJourneyByIdApi(journeyId)
          : getSharedJourneyByTokenApi(token ?? '');
        const result = await fetcher;
        if (cancelled) return;
        if (showLoadingScreen) setLoading(false);
        if (result.success) {
          const j = result.journey as SharedResponse;
          // #region agent log
          fetch('http://127.0.0.1:7313/ingest/1269dbcd-5a29-41de-8a60-39fdeb125f13',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ecaf3'},body:JSON.stringify({sessionId:'2ecaf3',runId:'pre-fix',hypothesisId:'H2',location:'SharedJourneyView.tsx:fetchSharedJourney.success',message:'frontend received shared journey response',data:{journeyId:j?.id??null,hasQaRunsKey:Object.prototype.hasOwnProperty.call(j as Record<string,unknown>,'qaRuns'),qaRunsIsArray:Array.isArray((j as any)?.qaRuns),qaRunsCount:Array.isArray((j as any)?.qaRuns)?((j as any).qaRuns as any[]).length:-1,responseKeys:j&&typeof j==='object'?Object.keys(j as Record<string,unknown>):[]},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          const snippetMap = j.eventSnippets ?? {};
          const nodes = Array.isArray(j.nodes) ? j.nodes : [];
          const enrichedNodes = nodes.map((n: any) => {
            if (n?.type !== 'triggerNode') return n;
            const eventId = n?.data?.connectedEvent?.eventId;
            if (typeof eventId !== 'string') return n;
            const rawVid = n?.data?.connectedEvent?.variantId;
            const variantKey =
              typeof rawVid === 'string' && rawVid.trim() !== ''
                ? `${eventId}::${rawVid.trim()}`
                : eventId;
            const sn =
              snippetMap[variantKey]?.snippets ?? snippetMap[eventId]?.snippets;
            if (!sn) return n;
            return { ...n, data: { ...n.data, codegenSnippets: sn } };
          });
          const rawQaRuns = Array.isArray((j as any).qaRuns) ? ((j as any).qaRuns as any[]) : [];
          const enrichedQaRuns = rawQaRuns.map((run: any) => {
            if (!Array.isArray(run?.nodes)) return run;
            const runNodes = run.nodes.map((n: any) => {
              if (n?.type !== 'triggerNode') return n;
              const eventId = n?.data?.connectedEvent?.eventId;
              if (typeof eventId !== 'string') return n;
              const rawVid = n?.data?.connectedEvent?.variantId;
              const variantKey =
                typeof rawVid === 'string' && rawVid.trim() !== ''
                  ? `${eventId}::${rawVid.trim()}`
                  : eventId;
              const sn =
                snippetMap[variantKey]?.snippets ?? snippetMap[eventId]?.snippets;
              if (!sn) return n;
              return { ...n, data: { ...n.data, codegenSnippets: sn } };
            });
            return { ...run, nodes: runNodes };
          });
          // #region agent log
          fetch('http://127.0.0.1:7313/ingest/1269dbcd-5a29-41de-8a60-39fdeb125f13',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'2ecaf3'},body:JSON.stringify({sessionId:'2ecaf3',runId:'pre-fix',hypothesisId:'H3',location:'SharedJourneyView.tsx:fetchSharedJourney.transform',message:'qa runs transformed before setJourney',data:{rawQaRunsCount:rawQaRuns.length,enrichedQaRunsCount:enrichedQaRuns.length,enrichedRunIds:enrichedQaRuns.map((r:any)=>r?.id),journeyId:j?.id??null,journeyIdPropProvided:typeof journeyId==='string'&&journeyId.length>0},timestamp:Date.now()})}).catch(()=>{});
          // #endregion
          setJourney({
            id: j.id,
            name: j.name,
            testing_instructions_markdown: j.testing_instructions_markdown ?? undefined,
            codegen_preferred_style: j.codegen_preferred_style ?? null,
            nodes: enrichedNodes,
            edges: Array.isArray(j.edges) ? j.edges : [],
            qaRuns: enrichedQaRuns,
          });
          setError(null);
          if (showLoadingScreen) setLoading(false);
        } else {
          setError('error' in result ? result.error : 'Failed to load journey');
          if (showLoadingScreen) setLoading(false);
        }
      } finally {
        inFlightRef.current = false;
      }
      return () => {
        cancelled = true;
      };
    },
    [journeyId, token]
  );

  useEffect(() => {
    void fetchSharedJourney({ showLoadingScreen: true });
  }, [fetchSharedJourney]);

  useEffect(() => {
    const onFocus = () => {
      // Refresh shared payload (QA runs, snippets, nodes) when user returns.
      void fetchSharedJourney({ showLoadingScreen: false });
    };
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        void fetchSharedJourney({ showLoadingScreen: false });
      }
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [fetchSharedJourney]);

  useEffect(() => {
    if (!journeyId) return;
    if (view !== 'brief') return;
    let cancelled = false;
    setBriefLoading(true);
    setBriefError(null);
    setBriefHtml(null);
    fetch(`${API_BASE}/api/shared/journeys/journey/${journeyId}/export/html`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            typeof (body as any)?.error === 'string'
              ? (body as any).error
              : res.statusText || 'Failed to load brief';
          throw new Error(msg);
        }
        return res.text();
      })
      .then((t) => {
        if (cancelled) return;
        setBriefHtml(t);
      })
      .catch((e) => {
        if (cancelled) return;
        setBriefError(e instanceof Error ? e.message : 'Failed to load brief');
      })
      .finally(() => {
        if (cancelled) return;
        setBriefLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, journeyId]);

  const enhanceExportDoc = React.useCallback(
    (iframe: HTMLIFrameElement | null, label: 'docs' | 'qa') => {
      if (!iframe) return;
      const doc = iframe.contentDocument;
      if (!doc?.documentElement) {
        console.debug('[shared-docs] enhanceExportDoc: no document', { label });
        return;
      }

      const root = doc.documentElement;
      if (root.getAttribute('data-e3-shared-enhanced') === '1') {
        console.debug('[shared-docs] enhanceExportDoc: already enhanced', { label });
        return;
      }
      root.setAttribute('data-e3-shared-enhanced', '1');

      const stepSections = doc.querySelectorAll('section.export-step');
      const tocLinks = doc.querySelectorAll('a.export-toc-link[href^="#step-"]');
      console.debug('[shared-docs] enhanceExportDoc: found', {
        label,
        steps: stepSections.length,
        tocLinks: tocLinks.length,
      });

      const expandAllSteps = () => {
        for (let i = 0; i < stepSections.length; i += 1) {
          const sec = stepSections[i] as HTMLElement;
          const btn = sec.querySelector(
            'button.export-step-header[data-accordion="toggle"]'
          );
          const body = sec.querySelector('.export-step-body[data-accordion="body"]');
          if (btn) btn.setAttribute('aria-expanded', 'true');
          if (body && body.hasAttribute('hidden')) body.removeAttribute('hidden');
        }
      };

      const scrollToStepId = (id: string) => {
        if (!id) return;
        const target = doc.getElementById(id);
        if (!target) return;
        try {
          target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        } catch {
          target.scrollIntoView();
        }
      };

      // Eliminate hash/anchor navigation: replace TOC anchors with buttons.
      for (let i = 0; i < tocLinks.length; i += 1) {
        const a = tocLinks[i] as HTMLAnchorElement;
        const href = a.getAttribute('href') || '';
        const id = href.replace('#', '');
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = a.className;
        b.setAttribute('data-export-step-target', id);
        b.innerHTML = a.innerHTML;
        b.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          expandAllSteps();
          scrollToStepId(b.getAttribute('data-export-step-target') || '');
        });
        a.parentNode?.replaceChild(b, a);
      }

      // Expand deterministically (twice to win over any accordion init).
      expandAllSteps();
      setTimeout(expandAllSteps, 0);
    },
    []
  );

  useEffect(() => {
    if (view !== 'qa') return;
    if (!activeQARunId) return;
    if (!journey) return;
    const run = (journey.qaRuns || []).find((r: any) => r?.id === activeQARunId) as QARun | undefined;
    if (!run) return;
    let cancelled = false;
    setQaBriefLoading(true);
    setQaBriefError(null);
    setQaBriefHtml(null);
    fetch(`${API_BASE}/api/shared/journeys/journey/${journey.id}/export/html`)
      .then(async (res) => {
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          const msg =
            typeof (body as any)?.error === 'string'
              ? (body as any).error
              : res.statusText || 'Failed to load QA docs';
          throw new Error(msg);
        }
        return res.text();
      })
      .then((t) => {
        if (cancelled) return;
        setQaBriefHtml(injectQaOverlayIntoExportHtml(t, run));
      })
      .catch((e) => {
        if (cancelled) return;
        setQaBriefError(e instanceof Error ? e.message : 'Failed to load QA docs');
      })
      .finally(() => {
        if (cancelled) return;
        setQaBriefLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view, activeQARunId, journey?.id, activeQARunSerialized]);

  useEffect(() => {
    if (!isModeMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      const el = modeMenuRef.current;
      if (!el) return;
      if (e.target instanceof Node && !el.contains(e.target)) {
        setIsModeMenuOpen(false);
      }
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [isModeMenuOpen]);

  if (loading) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-default)]">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-gray-600">Loading shared journey…</p>
        </div>
      </div>
    );
  }

  if (error || !journey) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-[var(--surface-default)]">
        <div className="text-center max-w-md px-4">
          <p className="text-red-600 font-medium">Invalid or expired link</p>
          <p className="text-sm text-gray-600 mt-1">{error ?? 'This share link may have been removed or has expired.'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full min-w-0 flex-col bg-[var(--surface-default)]">
      <div className="shrink-0 px-4 py-3 border-b bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {sharedHubReturnToken && typeof journeyId === 'string' && journeyId.length > 0 ? (
              <a
                href={buildAppPageUrl(`share/hub/${encodeURIComponent(sharedHubReturnToken)}`)}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-[var(--border-default)] bg-[var(--surface-panel)] px-2.5 py-1.5 text-xs font-medium text-gray-900 hover:bg-[var(--surface-default)]"
              >
                <ArrowLeft className="w-3.5 h-3.5 text-[var(--color-info)]" />
                Back to Shared Journey Homepage
              </a>
            ) : null}
            <div className="min-w-0">
              <h1 className="text-lg font-bold text-gray-900 truncate">{journey.name}</h1>
              <p className="text-xs text-gray-500 mt-0.5">
                Read-only view — design, docs, and QA runs
              </p>
            </div>
          </div>
          {journeyId && (
            <div className="flex items-center gap-2 shrink-0">
              <div className="relative" ref={modeMenuRef}>
              <button
                type="button"
                className="text-xs border rounded-md px-2 py-1.5 bg-gray-50 text-gray-900 min-w-[290px] flex items-center justify-between gap-2"
                onClick={() => setIsModeMenuOpen((v) => !v)}
              >
                <span className="flex items-center gap-2 truncate">
                  {view === 'journey' ? (
                    <PenTool className="w-3.5 h-3.5 text-[var(--color-info)]" />
                  ) : view === 'brief' ? (
                    <FileText className="w-3.5 h-3.5 text-[var(--color-info)]" />
                  ) : (sortedQARuns.find((r: any) => r.id === activeQARunId)?.endedAt ? (
                    <Lock className="w-3.5 h-3.5 text-gray-600" />
                  ) : (
                    <LockOpen className="w-3.5 h-3.5 text-emerald-600" />
                  ))}
                  <span className="truncate">
                    {view === 'journey'
                      ? 'Design Mode'
                      : view === 'brief'
                        ? 'Docs Mode'
                        : getQARunDisplayName(sortedQARuns.find((r: any) => r.id === activeQARunId) || null)}
                  </span>
                </span>
                <ChevronDown className="w-3.5 h-3.5 text-gray-500" />
              </button>
              {isModeMenuOpen && (
                <div className="absolute right-0 top-full mt-1 w-full bg-white border rounded-md shadow-lg z-50 overflow-hidden">
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => {
                      const u = new URL(window.location.href);
                      setView('journey');
                      setActiveQARunId(null);
                      u.searchParams.delete('view');
                      u.searchParams.delete('qa');
                      window.history.replaceState({}, '', u.toString());
                      setIsModeMenuOpen(false);
                    }}
                  >
                    <PenTool className="w-3.5 h-3.5 text-[var(--color-info)]" />
                    <span className="flex-1">Design Mode</span>
                    {view === 'journey' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  <button
                    type="button"
                    className="w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                    onClick={() => {
                      const u = new URL(window.location.href);
                      setView('brief');
                      setActiveQARunId(null);
                      u.searchParams.set('view', 'brief');
                      u.searchParams.delete('qa');
                      window.history.replaceState({}, '', u.toString());
                      setIsModeMenuOpen(false);
                    }}
                  >
                    <FileText className="w-3.5 h-3.5 text-[var(--color-info)]" />
                    <span className="flex-1">Docs Mode</span>
                    {view === 'brief' && <Check className="w-3.5 h-3.5 text-emerald-600" />}
                  </button>
                  {sortedQARuns.length > 0 && <div className="border-t" />}
                  {sortedQARuns.map((run: any) => {
                    const runStatus = computeQARunStatusForRun(run);
                    return (
                      <button
                        key={run.id}
                        type="button"
                        className="w-full px-2 py-1.5 text-xs text-left hover:bg-gray-50 flex items-center gap-2"
                        onClick={() => {
                          const u = new URL(window.location.href);
                          setView('qa');
                          setActiveQARunId(run.id);
                          u.searchParams.set('view', 'qa');
                          u.searchParams.set('qa', run.id);
                          window.history.replaceState({}, '', u.toString());
                          setIsModeMenuOpen(false);
                        }}
                      >
                        {run.endedAt ? (
                          <Lock className="w-3.5 h-3.5 text-gray-600" />
                        ) : (
                          <LockOpen className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                        <span className="flex-1 truncate">{getQARunDisplayName(run)}</span>
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold border ${
                          runStatus === 'PASSED'
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                            : runStatus === 'FAILED'
                              ? 'bg-red-100 text-red-800 border-red-200'
                              : 'bg-amber-100 text-amber-800 border-amber-200'
                        }`}>
                          {runStatus}
                        </span>
                        {view === 'qa' && activeQARunId === run.id && (
                          <Check className="w-3.5 h-3.5 text-emerald-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              </div>
              <button
                type="button"
                className="text-xs border rounded-md px-2.5 py-1.5 bg-white text-gray-900 hover:bg-gray-50 flex items-center gap-1.5 disabled:opacity-50"
                onClick={() => setIsExportModalOpen(true)}
                disabled={view === 'journey'}
                title={view === 'journey' ? 'Switch to Docs Mode to export' : 'Export shared docs'}
              >
                <Download className="w-3.5 h-3.5 text-[var(--color-info)]" />
                <span>Export</span>
              </button>
            </div>
          )}
        </div>
      </div>
      {journeyId && (
        <ExportShareDocModal
          open={isExportModalOpen}
          onClose={() => setIsExportModalOpen(false)}
          journeyId={journeyId}
          journeyName={journey?.name ?? 'shared-journey'}
          qaRuns={sortedQARuns as QARun[]}
        />
      )}
      <div className="flex-1 min-h-0">
        {view === 'brief' && journeyId ? (
          briefError ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center max-w-md px-4">
                <p className="text-red-600 font-medium">Failed to load docs</p>
                <p className="text-sm text-gray-600 mt-1">{briefError}</p>
              </div>
            </div>
          ) : briefLoading || !briefHtml ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-600">Loading docs…</p>
              </div>
            </div>
          ) : (
            <iframe
              title="Docs"
              className="block h-full w-full min-w-0 max-w-full border-0 bg-white"
              ref={docsIframeRef}
              srcDoc={briefHtml}
              onLoad={() => enhanceExportDoc(docsIframeRef.current, 'docs')}
            />
          )
        ) : view === 'qa' && activeQARunId ? (
          qaBriefError ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center max-w-md px-4">
                <p className="text-red-600 font-medium">Failed to load QA report</p>
                <p className="text-sm text-gray-600 mt-1">{qaBriefError}</p>
              </div>
            </div>
          ) : qaBriefLoading || !qaBriefHtml ? (
            <div className="flex h-full w-full items-center justify-center bg-[var(--surface-default)]">
              <div className="text-center">
                <div className="w-8 h-8 border-2 border-[var(--color-info)] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
                <p className="text-sm text-gray-600">Loading QA report…</p>
              </div>
            </div>
          ) : (
            <iframe
              title="QA Report"
              className="block h-full w-full min-w-0 max-w-full border-0 bg-white"
              ref={qaIframeRef}
              srcDoc={qaBriefHtml}
              onLoad={() => enhanceExportDoc(qaIframeRef.current, 'qa')}
            />
          )
        ) : (
          <ReactFlowProvider>
            <JourneyCanvas
              journey={journey}
              workspaceId={null}
              activeQARunId={null}
              readOnly
            />
          </ReactFlowProvider>
        )}
      </div>
    </div>
  );
}

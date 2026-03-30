import React, { useState, useEffect, useCallback } from 'react';
import { Copy, Check, Code } from 'lucide-react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { codegenLanguageForStyle, highlightCodeToHtml } from '@/src/lib/codeHighlight';

export type CodegenStyle = 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi';

export interface CodegenSnippets {
  dataLayer: string;
  bloomreachSdk: string;
  bloomreachApi: string;
}

type EventCodeGenProps = {
  /** Event ID to fetch snippets for (GET /api/events/:id/codegen). */
  eventId: string | null | undefined;
  /** Required for live fetch when `prefetchedSnippets` is not set. Omit or pass `null` on public shared views (snippets come from prefetch only). */
  workspaceId?: string | null;
  /** Optional: precomputed snippets (e.g. in public shared view). */
  prefetchedSnippets?: CodegenSnippets | null;
  /** Optional: show a compact header (e.g. in Journey sidebar). */
  compact?: boolean;
  /** Section title. */
  title?: string;
  /** Journey-level preferred default method (if set, shown as the active code block). */
  preferredStyle?: CodegenStyle | null;
};

const STYLE_LABELS: Record<CodegenStyle, string> = {
  dataLayer: 'dataLayer',
  bloomreachSdk: 'Bloomreach SDK',
  bloomreachApi: 'Bloomreach API',
};

export function EventCodeGen({
  eventId,
  workspaceId,
  prefetchedSnippets = null,
  compact = false,
  title = 'Code Snippets',
  preferredStyle = null,
}: EventCodeGenProps) {
  const [snippets, setSnippets] = useState<CodegenSnippets | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<CodegenStyle>(preferredStyle ?? 'dataLayer');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (preferredStyle) {
      setActiveStyle(preferredStyle);
    }
  }, [preferredStyle]);

  useEffect(() => {
    if (prefetchedSnippets) {
      setSnippets(prefetchedSnippets);
      setError(null);
      setLoading(false);
      return;
    }
    if (!eventId) {
      setSnippets(null);
      setError(null);
      return;
    }
    const wid = typeof workspaceId === 'string' ? workspaceId.trim() : '';
    if (!wid) {
      setSnippets(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchWithAuth(`${API_BASE}/api/events/${eventId}/codegen`, {
      headers: { 'x-workspace-id': wid },
    })
      .then((res) => {
        if (!res.ok) throw new Error(res.statusText || 'Failed to load codegen');
        return res.json();
      })
      .then((data: CodegenSnippets) => {
        setSnippets(data);
      })
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load snippets');
        setSnippets(null);
      })
      .finally(() => setLoading(false));
  }, [eventId, workspaceId]);

  const copyToClipboard = useCallback(() => {
    if (!snippets) return;
    const style = preferredStyle ?? activeStyle;
    const text = snippets[style];
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [snippets, activeStyle, preferredStyle]);

  if (!eventId) {
    return (
      <div className={compact ? '' : 'space-y-4'}>
        <div className="flex items-center gap-2 mb-4">
          <Code className="w-4 h-4 text-gray-400" />
          <h3 className="text-[15px] font-bold text-gray-800">{title}</h3>
        </div>
        <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-500">
          Select an event to see code snippets.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={compact ? '' : 'space-y-4'}>
        <div className="flex items-center gap-2 mb-4">
          <Code className="w-4 h-4 text-gray-400" />
          <h3 className="text-[15px] font-bold text-gray-800">{title}</h3>
        </div>
        <div className="bg-gray-50 border rounded-lg p-4 text-sm text-gray-500">
          Loading snippets…
        </div>
      </div>
    );
  }

  if (error || !snippets) {
    return (
      <div className={compact ? '' : 'space-y-4'}>
        <div className="flex items-center gap-2 mb-4">
          <Code className="w-4 h-4 text-gray-400" />
          <h3 className="text-[15px] font-bold text-gray-800">{title}</h3>
        </div>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
          {error || 'Failed to load code snippets.'}
        </div>
      </div>
    );
  }

  const currentStyle = preferredStyle ?? activeStyle;
  const currentSnippet = snippets[currentStyle];
  const language = codegenLanguageForStyle(currentStyle);
  const highlighted = highlightCodeToHtml(currentSnippet, language);

  return (
    <div className={compact ? '' : 'space-y-4'}>
      <div className="flex items-center gap-2 mb-4">
        <Code className="w-4 h-4 text-gray-400" />
        <h3 className="text-[15px] font-bold text-gray-800">{title}</h3>
      </div>

      {!preferredStyle && (
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg border border-gray-200">
          {(Object.keys(STYLE_LABELS) as CodegenStyle[]).map((style) => (
            <button
              key={style}
              type="button"
              onClick={() => setActiveStyle(style)}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                activeStyle === style
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              {STYLE_LABELS[style]}
            </button>
          ))}
        </div>
      )}

      <div className="bg-[var(--surface-code)] rounded-xl overflow-hidden shadow-sm border border-[var(--border-code)]">
        <div className="px-4 py-2 bg-[var(--surface-code-header)] border-b border-[var(--border-code)] flex justify-between items-center">
          <span className="text-[12px] font-semibold text-gray-300">
            {STYLE_LABELS[currentStyle]}
          </span>
          <button
            type="button"
            onClick={copyToClipboard}
            className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" /> Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" /> Copy
              </>
            )}
          </button>
        </div>
        <pre className="p-4 text-[13px] font-mono text-[var(--text-code)] overflow-x-auto whitespace-pre-wrap leading-relaxed max-h-[320px] overflow-y-auto">
          <code
            className="code-highlight"
            data-language={language}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        </pre>
      </div>
      <style>{`
        .code-highlight .ch-kw { color: #93c5fd; }
        .code-highlight .ch-str { color: #86efac; }
        .code-highlight .ch-num { color: #fca5a5; }
        .code-highlight .ch-lit { color: #c4b5fd; }
        .code-highlight .ch-com { color: #94a3b8; font-style: italic; }
        .code-highlight .ch-key { color: #fcd34d; }
      `}</style>
    </div>
  );
}

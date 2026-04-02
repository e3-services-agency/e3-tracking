import React, { useState, useEffect } from 'react';
import { Code } from 'lucide-react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { codegenLanguageForStyle } from '@/src/lib/codeHighlight';
import { CodeBlock } from '@/src/components/ui/CodeBlock';

export type CodegenStyle = 'dataLayer' | 'bloomreachSdk' | 'bloomreachApi';

export interface CodegenSnippets {
  dataLayer: string;
  bloomreachSdk: string;
  bloomreachApi: string;
}

type EventCodeGenProps = {
  eventId: string | null | undefined;
  workspaceId?: string | null;
  /** When set, fetches variant-aware codegen (`?variant_id=`) and skips prefetched base snippets. */
  variantId?: string | null;
  prefetchedSnippets?: CodegenSnippets | null;
  compact?: boolean;
  title?: string;
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
  variantId = null,
  prefetchedSnippets = null,
  compact = false,
  title = 'Code Snippets',
  preferredStyle = null,
}: EventCodeGenProps) {
  const [snippets, setSnippets] = useState<CodegenSnippets | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeStyle, setActiveStyle] = useState<CodegenStyle>(preferredStyle ?? 'dataLayer');

  useEffect(() => {
    if (preferredStyle) {
      setActiveStyle(preferredStyle);
    }
  }, [preferredStyle]);

  useEffect(() => {
    const looksLikeHighlightedHtml = (sn: CodegenSnippets | null | undefined): boolean => {
      if (!sn) return false;
      const vals = [sn.dataLayer, sn.bloomreachSdk, sn.bloomreachApi];
      return vals.some(
        (v) =>
          typeof v === 'string' &&
          (v.includes('<span') || v.includes('class="ch-') || v.includes('&lt;span') || v.includes('ch-num'))
      );
    };

    const hasVariant =
      typeof variantId === 'string' && variantId.trim() !== '';

    if (prefetchedSnippets && !looksLikeHighlightedHtml(prefetchedSnippets) && !hasVariant) {
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
    const vid =
      typeof variantId === 'string' && variantId.trim() !== '' ? variantId.trim() : '';
    const qs = vid ? `?variant_id=${encodeURIComponent(vid)}` : '';
    fetchWithAuth(`${API_BASE}/api/events/${eventId}/codegen${qs}`, {
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
  }, [eventId, workspaceId, variantId, prefetchedSnippets]);

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

  // Map our internal language label to the ones supported by SyntaxHighlighter
  const baseLanguage = codegenLanguageForStyle(currentStyle);
  const highlightLanguage = baseLanguage === 'json' ? 'json' : 'javascript';

  return (
    <div className={compact ? '' : 'space-y-4'}>
      <div className="flex items-center gap-2 mb-4">
        <Code className="w-4 h-4 text-gray-400" />
        <h3 className="text-[15px] font-bold text-gray-800">{title}</h3>
      </div>

      {!preferredStyle && (
        <div className="flex gap-1 p-1 bg-gray-100 rounded-lg border border-gray-200 mb-2">
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

      <CodeBlock
        code={currentSnippet}
        language={highlightLanguage as 'javascript' | 'typescript' | 'json'}
        className="max-h-[320px] overflow-y-auto"
      />
    </div>
  );
}

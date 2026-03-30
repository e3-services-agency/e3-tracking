import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeRaw from 'rehype-raw';
import { BookOpen, FileText, LayoutDashboard, LayoutList, Loader2, Shield } from 'lucide-react';

const BASE_PATH =
  typeof import.meta !== 'undefined' && import.meta.env?.BASE_URL != null
    ? `${String(import.meta.env.BASE_URL).replace(/\/$/, '')}/docs/user-manual`.replace(/\/+/g, '/')
    : '/docs/user-manual';

const ARTICLES = [
  { id: 'getting-started', label: 'Getting Started', file: 'getting-started.md', icon: BookOpen },
  { id: 'data-dictionary', label: 'Data Dictionary', file: 'data-dictionary.md', icon: FileText },
  { id: 'catalogs', label: 'Catalogs & Mapping', file: 'catalogs.md', icon: LayoutList },
  { id: 'journey-builder', label: 'Journey Builder', file: 'journey-builder.md', icon: FileText },
  { id: 'workspace-management', label: 'Workspace Management', file: 'workspace-management.md', icon: LayoutDashboard },
  { id: 'security-and-admin', label: 'Security & Admin', file: 'security-and-admin.md', icon: Shield },
] as const;

type ArticleId = (typeof ARTICLES)[number]['id'];

export function Documentation() {
  const [activeId, setActiveId] = useState<ArticleId>('getting-started');
  const [content, setContent] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const activeArticle = ARTICLES.find((a) => a.id === activeId);
  const file = activeArticle?.file ?? ARTICLES[0].file;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`${BASE_PATH}/${file}`)
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load ${file}`);
        return res.text();
      })
      .then(setContent)
      .catch((e) => {
        setError(e instanceof Error ? e.message : 'Failed to load article');
        setContent('');
      })
      .finally(() => setLoading(false));
  }, [file]);

  return (
    <div className="flex flex-1 min-w-0 overflow-hidden bg-[var(--surface-default)]">
      <aside className="w-56 shrink-0 border-r border-gray-200 bg-white flex flex-col">
        <div className="p-4 border-b border-gray-100">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Knowledge Base
          </h2>
        </div>
        <nav className="p-2 flex flex-col gap-0.5">
          {ARTICLES.map((article) => {
            const Icon = article.icon;
            return (
              <button
                key={article.id}
                type="button"
                onClick={() => setActiveId(article.id)}
                className={`flex items-center gap-2 px-3 py-2.5 text-left text-sm rounded-md transition-colors ${
                  activeId === article.id
                    ? 'bg-[var(--brand-primary)]/10 text-[var(--brand-primary)] font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {article.label}
              </button>
            );
          })}
        </nav>
      </aside>
      <div className="flex-1 overflow-auto">
        <div className="max-w-3xl mx-auto px-8 py-10">
          {loading && (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin mr-2" />
              Loading…
            </div>
          )}
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-red-700 text-sm">
              {error}
            </div>
          )}
          {!loading && !error && content && (
            <div className="min-w-0 max-w-full [&_pre]:max-w-full [&_pre]:overflow-x-auto [&_code]:break-words [&_table]:block [&_table]:w-full [&_table]:max-w-full [&_table]:overflow-x-auto">
              <ReactMarkdown
                rehypePlugins={[rehypeRaw]}
                className="prose prose-e3 max-w-none min-w-0 break-words"
              >
                {content}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

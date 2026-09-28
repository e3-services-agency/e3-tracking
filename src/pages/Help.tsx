/**
 * Help page (sidebar, T-4-09): renders the repo's own reference docs and the glossary in-app, so
 * nobody has to leave the browser to read `docs/*.md`. Docs are loaded at build time via Vite's
 * `?raw` import (native support, `vite/client`'s `declare module '*?raw'`), not fetched at
 * runtime -- they are bundled with the app like any other source file.
 */
import React, { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { BookOpen } from 'lucide-react';
import domainDoc from '../../docs/DOMAIN.md?raw';
import exportsDoc from '../../docs/EXPORTS.md?raw';
import qaLocalDoc from '../../docs/QA-LOCAL.md?raw';
import libraryDoc from '../../docs/LIBRARY.md?raw';
import mcpDoc from '../../docs/MCP.md?raw';
import trackingDocumentDoc from '../../docs/TRACKING-DOCUMENT.md?raw';
import { GLOSSARY } from '@/src/domain/glossary';

const ARTICLES = [
  { id: 'domain', label: 'Domain model', content: domainDoc },
  { id: 'exports', label: 'Exports', content: exportsDoc },
  { id: 'qa-local', label: 'Running QA locally', content: qaLocalDoc },
  { id: 'library', label: 'Use case library', content: libraryDoc },
  { id: 'mcp', label: 'MCP server', content: mcpDoc },
  { id: 'tracking-document', label: 'Tracking document', content: trackingDocumentDoc },
  { id: 'glossary', label: 'Glossary', content: null },
] as const;

type ArticleId = (typeof ARTICLES)[number]['id'];

export function Help() {
  const [activeId, setActiveId] = useState<ArticleId>('domain');
  const active = ARTICLES.find((a) => a.id === activeId) ?? ARTICLES[0];

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      <div className="w-64 border-r bg-white p-4 space-y-1 overflow-y-auto">
        <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-3">
          <BookOpen className="w-5 h-5" /> Help
        </h1>
        {ARTICLES.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setActiveId(a.id)}
            className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${
              activeId === a.id ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]' : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-y-auto p-8">
        {active.content !== null ? (
          <article className="prose prose-sm max-w-3xl">
            <ReactMarkdown>{active.content}</ReactMarkdown>
          </article>
        ) : (
          <div className="max-w-3xl space-y-6">
            <h2 className="text-xl font-bold text-gray-900">Glossary</h2>
            <dl className="space-y-4">
              {GLOSSARY.map((entry) => (
                <div key={entry.key}>
                  <dt className="font-semibold text-gray-900">{entry.term}</dt>
                  <dd className="text-sm text-gray-600">{entry.definition}</dd>
                </div>
              ))}
            </dl>
          </div>
        )}
      </div>
    </div>
  );
}

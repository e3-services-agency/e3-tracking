/**
 * Help page (T-4-09, unified with the old Documentation page in T-4-13): one left navigation with
 * three groups -- Guide (how-to pages), Reference (the repo docs) and Glossary -- and a "Copy as
 * Markdown" button that copies the current page's Markdown source. The current page lives in the
 * URL (`/help/<slug>`, `helpSlugFromPathname`), so a page can be linked and survives a reload.
 */
import React, { useEffect, useState } from 'react';
import { BookOpen } from 'lucide-react';
import { MarkdownView } from '@/src/components/ui/MarkdownView';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { helpPathForSlug, helpSlugFromPathname } from '@/src/components/layout/mainRoute';
import { DEFAULT_HELP_SLUG, HELP_ARTICLES, HELP_GROUPS, findHelpArticle } from './helpContent';

function currentSlug(): string {
  if (typeof window === 'undefined') return DEFAULT_HELP_SLUG;
  return findHelpArticle(helpSlugFromPathname(window.location.pathname)).slug;
}

export function Help() {
  const [slug, setSlug] = useState<string>(currentSlug);
  const active = findHelpArticle(slug);

  useEffect(() => {
    const onPop = () => setSlug(currentSlug());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const select = (next: string) => {
    setSlug(next);
    try {
      const path = helpPathForSlug(window.location.pathname, next);
      if (window.location.pathname !== path) window.history.pushState({}, '', path);
    } catch {
      // ignore: navigation state only
    }
  };

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      <nav aria-label="Help sections" className="w-64 shrink-0 border-r bg-white p-4 overflow-y-auto">
        <div className="sticky top-0 space-y-4">
          <h1 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <BookOpen className="w-5 h-5" /> Help
          </h1>
          {HELP_GROUPS.map((group) => (
            <div key={group} className="space-y-1">
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-3">{group}</h2>
              {HELP_ARTICLES.filter((a) => a.group === group).map((a) => (
                <button
                  key={a.slug}
                  type="button"
                  aria-current={a.slug === active.slug ? 'page' : undefined}
                  onClick={() => select(a.slug)}
                  className={`w-full text-left px-3 py-2 rounded-md text-sm font-medium ${
                    a.slug === active.slug ? 'bg-[var(--color-info)]/10 text-[var(--color-info)]' : 'text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {a.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </nav>
      <div className="flex-1 overflow-y-auto p-8">
        <div className="max-w-3xl">
          <div className="flex justify-end mb-4">
            <CopyMarkdownButton getMarkdown={() => active.markdown} />
          </div>
          <MarkdownView source={active.markdown} />
        </div>
      </div>
    </div>
  );
}

/**
 * Help page (T-4-09, unified with the old Documentation page in T-4-13): one left navigation with
 * three groups -- Guide (how-to pages), Reference (the repo docs) and Glossary -- and a "Copy as
 * Markdown" button that copies the current page's Markdown source. The current page lives in the
 * URL (`/help/<slug>`, `helpSlugFromPathname`), so a page can be linked and survives a reload.
 *
 * Layout rule (T-4-12): no scroll containers here; only `<main>` scrolls. The navigation is
 * `position: sticky` inside `<main>`, and the article uses the full `PageBody` width so wide
 * documentation tables are not squeezed into a narrow column.
 */
import React, { useEffect, useState } from 'react';
import { MarkdownView } from '@/src/components/ui/MarkdownView';
import { CopyMarkdownButton } from '@/src/components/ui/CopyMarkdownButton';
import { PageBody, PageHeader } from '@/src/components/layout/PageShell';
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
    <div className="flex-1 flex flex-col">
      <PageHeader className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Help</h1>
        <CopyMarkdownButton getMarkdown={() => active.markdown} />
      </PageHeader>
      <PageBody className="flex items-start gap-8">
        <nav aria-label="Help sections" className="w-56 shrink-0 sticky top-8 self-start space-y-4">
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
        </nav>
        <article className="flex-1 min-w-0">
          <MarkdownView source={active.markdown} />
        </article>
      </PageBody>
    </div>
  );
}

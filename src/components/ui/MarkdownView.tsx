/**
 * The one react-markdown wrapper (T-4-13): GitHub-flavoured Markdown (pipe tables, task lists,
 * autolinks) through `remark-gfm`; raw HTML stays disabled. Fenced json/ts/js blocks use the app's
 * `CodeBlock`, other languages a plain preformatted block.
 */
import React from 'react';
import ReactMarkdown, { defaultUrlTransform } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '@/src/components/ui/CodeBlock';
import { EXTERNAL_LINK_REL, externalHost } from '@/src/domain/markdownEdit';

function highlightLanguage(lang: string): 'javascript' | 'typescript' | 'json' | null {
  const l = lang.toLowerCase();
  if (l === 'json') return 'json';
  if (l === 'ts' || l === 'tsx' || l === 'typescript') return 'typescript';
  if (l === 'js' || l === 'javascript') return 'javascript';
  return null;
}

export interface MarkdownViewOptions {
  /**
   * Comment mode (D-71): external links show their host in a muted suffix, and images render only
   * when `resolveImage` maps their `attachment:<id>` source to a URL (unknown id or any other
   * source shows the alt text only, so a comment never loads a remote image).
   */
  resolveImage?: (src: string | undefined) => string | null;
}

export function MarkdownView({ source, resolveImage }: { source: string } & MarkdownViewOptions) {
  return (
    <div className="prose prose-sm prose-e3 max-w-none min-w-0 break-words [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        urlTransform={(url, key) => (key === 'src' && /^attachment:/i.test(url) ? url : defaultUrlTransform(url))}
        components={{
          pre({ children }) {
            // Every fenced block lands here (one `code` child), so single-line and language-less
            // fences still render inside a <pre>.
            const child = React.Children.toArray(children)[0] as React.ReactElement<{ className?: string; children?: React.ReactNode }> | undefined;
            const className = child?.props?.className;
            const text = String(child?.props?.children ?? '').replace(/\n$/, '');
            const match = /language-([\w-]+)/.exec(className || '');
            const lang = match ? highlightLanguage(match[1]) : null;
            if (lang) {
              return (
                <div className="my-4 not-prose">
                  <CodeBlock code={text} language={lang} />
                </div>
              );
            }
            return (
              <pre className="my-4 overflow-x-auto rounded-md bg-gray-50 p-3 text-xs">
                <code>{text}</code>
              </pre>
            );
          },
          a({ node: _node, href, children, ...props }) {
            // Unsafe schemes (javascript:, data:, vbscript:) are blanked by the url transform: render the text only.
            if (!href) return <>{children}</>;
            const external = /^(https?:)?\/\//i.test(href);
            const linkText = typeof children === 'string' ? children : Array.isArray(children) && children.every((c) => typeof c === 'string') ? children.join('') : null;
            const host = resolveImage && external ? externalHost(href) : null;
            const textIsUrl = linkText !== null && (linkText === href || linkText === host || linkText.replace(/^https?:\/\//i, '').replace(/\/$/, '') === (host ?? ''));
            return (
              <a href={href} {...props} {...(external ? { target: '_blank', rel: EXTERNAL_LINK_REL } : {})}>
                {children}
                {host && !textIsUrl && <span className="ml-1 text-[11px] text-gray-400 no-underline">({host})</span>}
              </a>
            );
          },
          img({ node: _node, src, alt }) {
            if (!resolveImage) return <img src={src} alt={alt ?? ''} />;
            const url = resolveImage(typeof src === 'string' ? src : undefined);
            if (!url) return <span>{alt ?? ''}</span>;
            return <img src={url} alt={alt ?? ''} className="max-h-64 w-auto rounded border" />;
          },
          code({ node: _node, className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { node?: unknown }) {
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

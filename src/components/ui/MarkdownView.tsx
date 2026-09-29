/**
 * The one react-markdown wrapper (T-4-13): GitHub-flavoured Markdown (pipe tables, task lists,
 * autolinks) through `remark-gfm`; raw HTML stays disabled. Fenced json/ts/js blocks use the app's
 * `CodeBlock`, other languages a plain preformatted block.
 */
import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { CodeBlock } from '@/src/components/ui/CodeBlock';

function highlightLanguage(lang: string): 'javascript' | 'typescript' | 'json' | null {
  const l = lang.toLowerCase();
  if (l === 'json') return 'json';
  if (l === 'ts' || l === 'tsx' || l === 'typescript') return 'typescript';
  if (l === 'js' || l === 'javascript') return 'javascript';
  return null;
}

export function MarkdownView({ source }: { source: string }) {
  return (
    <div className="prose prose-sm prose-e3 max-w-none min-w-0 break-words [&_table]:block [&_table]:max-w-full [&_table]:overflow-x-auto">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          pre({ children }) {
            return <>{children}</>;
          },
          a({ node: _node, href, children, ...props }) {
            const external = typeof href === 'string' && /^https?:\/\//i.test(href);
            return (
              <a href={href} {...props} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {children}
              </a>
            );
          },
          code({ node: _node, className, children, ...props }: React.ComponentPropsWithoutRef<'code'> & { node?: unknown }) {
            const match = /language-([\w-]+)/.exec(className || '');
            const text = String(children).replace(/\n$/, '');
            const isBlock = Boolean(match) || text.includes('\n');
            if (!isBlock) {
              return (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            }
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
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

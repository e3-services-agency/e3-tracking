import React from 'react';
import ReactMarkdown from 'react-markdown';

type JourneyDescriptionMarkdownProps = {
  text: string;
  className?: string;
};

/**
 * Renders journey node description as Markdown (headings, bold, italic, lists, paragraphs).
 * No raw HTML — trusted app content only, no rehype-raw.
 */
export function JourneyDescriptionMarkdown({
  text,
  className = '',
}: JourneyDescriptionMarkdownProps) {
  const src = (text ?? '').trim();
  if (!src) return null;

  return (
    <div
      className={`min-w-0 max-w-full text-gray-800 [overflow-wrap:anywhere] [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_ol]:my-2 [&_ol]:list-decimal [&_ol]:pl-4 [&_ol]:space-y-0.5 [&_li]:pl-0.5 [&_strong]:font-semibold [&_em]:italic ${className}`}
    >
      <ReactMarkdown
        components={{
          h1: ({ children }) => (
            <h1 className="text-xl font-bold text-gray-900 mt-3 mb-2 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-lg font-bold text-gray-900 mt-3 mb-2 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-base font-semibold text-gray-900 mt-2 mb-1 first:mt-0">{children}</h3>
          ),
          p: ({ children }) => <p className="whitespace-pre-wrap break-words">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 my-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 my-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="break-words">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
          em: ({ children }) => <em className="italic text-gray-800">{children}</em>,
          code: ({ className, children, ...props }) => {
            const inline = !className;
            if (inline) {
              return (
                <code
                  className="rounded bg-gray-100 px-1 text-[0.9em] [overflow-wrap:anywhere]"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
          pre: ({ children }) => (
            <pre className="my-2 max-w-full min-w-0 overflow-x-auto rounded border border-gray-200 bg-gray-50 p-2 text-xs">
              {children}
            </pre>
          ),
        }}
      >
        {src}
      </ReactMarkdown>
    </div>
  );
}

import React from 'react';
import ReactMarkdown from 'react-markdown';

type JourneyDescriptionMarkdownProps = {
  text: string;
  className?: string;
};

/**
 * Renders journey node description as Markdown (bold, lists, paragraphs).
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
      className={`min-w-0 max-w-full text-gray-800 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_ul]:my-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ul]:space-y-0.5 [&_li]:pl-0.5 [&_strong]:font-semibold ${className}`}
    >
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="whitespace-pre-wrap break-words">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-4 my-2 space-y-0.5">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-4 my-2 space-y-0.5">{children}</ol>,
          li: ({ children }) => <li className="break-words">{children}</li>,
          strong: ({ children }) => <strong className="font-semibold text-gray-900">{children}</strong>,
        }}
      >
        {src}
      </ReactMarkdown>
    </div>
  );
}

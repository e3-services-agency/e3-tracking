import React, { useState } from 'react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import js from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import ts from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import { googlecode } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { Copy, Check } from 'lucide-react';

// Apply clarity overrides to fix googlecode's default overlapping colors
googlecode['hljs-number'] = { color: '#005cc5' }; // Modern Blue for integers
googlecode['hljs-attr'] = { color: '#24292e', fontWeight: 'bold' }; // Bold keys
googlecode['hljs-comment'] = { color: '#d73a49', fontStyle: 'italic' }; // Distinct Red for comments
googlecode['hljs-string'] = { color: '#0A8040' }; // Darker green for strings

// Register only required languages to keep your app's bundle size small
SyntaxHighlighter.registerLanguage('javascript', js);
SyntaxHighlighter.registerLanguage('typescript', ts);
SyntaxHighlighter.registerLanguage('json', json);

interface CodeBlockProps {
  code: string;
  language?: 'javascript' | 'typescript' | 'json';
  className?: string;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'typescript',
  className = '',
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('[CodeBlock] copy failed', err);
    }
  };

  return (
    <div className={`relative rounded-md overflow-hidden border border-gray-200 bg-[#fafafa] group ${className}`}>
      {/* Copy Button Overlay */}
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded-md bg-white border border-gray-200 text-gray-500 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-gray-50 hover:text-gray-900 transition-all z-10"
        aria-label="Copy code"
      >
        {copied ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
      </button>

      {/* Syntax Highlighted Output */}
      <SyntaxHighlighter
        language={language}
        style={googlecode}
        customStyle={{
          margin: 0,
          padding: '1.25rem',
          fontSize: '0.875rem',
          lineHeight: '1.5',
          backgroundColor: 'transparent',
        }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
};

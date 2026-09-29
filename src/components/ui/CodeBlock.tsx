import React, { useState } from 'react';
import { Light as SyntaxHighlighter } from 'react-syntax-highlighter';
import js from 'react-syntax-highlighter/dist/esm/languages/hljs/javascript';
import ts from 'react-syntax-highlighter/dist/esm/languages/hljs/typescript';
import json from 'react-syntax-highlighter/dist/esm/languages/hljs/json';
import { googlecode } from 'react-syntax-highlighter/dist/esm/styles/hljs';
import { Copy, Check } from 'lucide-react';
import { copyText } from './clipboard';

// Apply clarity overrides to fix googlecode's default overlapping colors. Colors come from the
// `--syntax-*` CSS variables (src/index.css) rather than literal hex so this file passes
// `lint:colors` (no hex allowed outside src/index.css).
googlecode['hljs-number'] = { color: 'var(--syntax-number)' }; // Modern Blue for integers
googlecode['hljs-attr'] = { color: 'var(--syntax-attr)', fontWeight: 'bold' }; // Bold keys
googlecode['hljs-comment'] = { color: 'var(--syntax-comment)', fontStyle: 'italic' }; // Distinct Red for comments
googlecode['hljs-string'] = { color: 'var(--syntax-string)' }; // Darker green for strings

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
  const [state, setState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const handleCopy = async () => {
    const ok = await copyText(code);
    setState(ok ? 'copied' : 'failed');
    setTimeout(() => setState('idle'), 2000);
  };

  return (
    <div
      className={`relative rounded-md overflow-hidden border border-gray-200 ${className}`}
      style={{ backgroundColor: 'var(--syntax-code-bg)' }}
    >
      {/* Copy button, always visible so touch and keyboard users find it (T-4-14) */}
      <button
        type="button"
        onClick={handleCopy}
        className="absolute top-2 right-2 inline-flex items-center gap-1 p-1.5 rounded-md bg-white border border-gray-200 text-xs text-gray-500 hover:bg-gray-50 hover:text-gray-900 transition-all z-10"
        aria-label="Copy code"
      >
        {state === 'copied' ? <Check size={16} className="text-green-600" /> : <Copy size={16} />}
        {state === 'copied' && <span role="status">Copied</span>}
        {state === 'failed' && <span role="status" className="text-red-700">Copy failed</span>}
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

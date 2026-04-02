import React, { useCallback, useEffect, useRef, useState } from 'react';
import { renderQaNotesMarkdownToHtml } from '@/src/lib/qaNotesMarkdown';

type QaNotesMarkdownFieldProps = {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  /** When true, only rendered markdown is shown (shared / locked QA). */
  readOnly?: boolean;
  className?: string;
  minHeight?: string;
};

export function QaNotesMarkdownField({
  value,
  onChange,
  placeholder = '',
  readOnly = false,
  className = '',
  minHeight = '7rem',
}: QaNotesMarkdownFieldProps) {
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (focused) {
      taRef.current?.focus();
    }
  }, [focused]);

  const html = renderQaNotesMarkdownToHtml(value);

  const applyChange = useCallback(
    (next: string, selStart?: number, selEnd?: number) => {
      onChange(next);
      if (selStart !== undefined && selEnd !== undefined) {
        requestAnimationFrame(() => {
          const el = taRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(selStart, selEnd);
        });
      }
    },
    [onChange]
  );

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (readOnly) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;

      const ta = e.currentTarget;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const v = value;

      const wrap = (before: string, after: string) => {
        e.preventDefault();
        const sel = v.slice(start, end);
        const next = v.slice(0, start) + before + sel + after + v.slice(end);
        const pos = start + before.length + sel.length + after.length;
        applyChange(next, pos, pos);
      };

      if (e.key === 'b' || e.key === 'B') {
        wrap('**', '**');
        return;
      }
      if (e.key === 'i' || e.key === 'I') {
        if (e.shiftKey) return;
        wrap('*', '*');
        return;
      }

      if (e.shiftKey && e.code === 'Digit7') {
        e.preventDefault();
        const startLine = v.lastIndexOf('\n', start - 1) + 1;
        const endIdx = v.indexOf('\n', Math.max(end - 1, 0));
        const endLine = endIdx === -1 ? v.length : endIdx;
        const block = v.slice(startLine, endLine);
        const lines = block.split('\n');
        let n = 1;
        const nextLines = lines.map((line) => {
          const stripped = line.replace(/^\d+\.\s+/, '');
          return `${n++}. ${stripped}`;
        });
        const next =
          v.slice(0, startLine) + nextLines.join('\n') + v.slice(endLine);
        const delta = next.length - v.length;
        applyChange(next, start + delta, start + delta);
        return;
      }

      if (e.shiftKey && e.code === 'Digit8') {
        e.preventDefault();
        const startLine = v.lastIndexOf('\n', start - 1) + 1;
        const endIdx = v.indexOf('\n', Math.max(end - 1, 0));
        const endLine = endIdx === -1 ? v.length : endIdx;
        const block = v.slice(startLine, endLine);
        const lines = block.split('\n');
        const nextLines = lines.map((line) => {
          const stripped = line.replace(/^[-*]\s+/, '');
          return `- ${stripped}`;
        });
        const next =
          v.slice(0, startLine) + nextLines.join('\n') + v.slice(endLine);
        const delta = next.length - v.length;
        applyChange(next, start + delta, start + delta);
        return;
      }

      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        const sel = v.slice(start, end);
        const label = sel || 'text';
        const urlRaw = window.prompt('Link URL', 'https://');
        if (urlRaw === null) return;
        const insert = `[${label}](${urlRaw.trim()})`;
        const next = v.slice(0, start) + insert + v.slice(end);
        const pos = start + insert.length;
        applyChange(next, pos, pos);
      }
    },
    [applyChange, readOnly, value]
  );

  const previewClasses =
    'w-full rounded-md border border-input bg-muted/40 px-3 py-2 text-sm text-left cursor-text text-gray-900 [&_a]:text-blue-700 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:my-1 [&_ol]:list-decimal [&_ol]:pl-5 [&_ol]:my-1 [&_p]:mb-2 [&_p:last-child]:mb-0 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_h1]:text-lg [&_h1]:font-bold [&_h2]:text-base [&_h2]:font-semibold [&_h3]:text-sm [&_h3]:font-semibold [&_h4]:text-sm [&_h4]:font-medium';

  if (readOnly) {
    if (!value.trim()) {
      return (
        <div className={`text-xs text-gray-500 italic ${className}`}>No notes added.</div>
      );
    }
    return (
      <div
        className={`qa-notes-md-preview ${previewClasses} ${className}`}
        style={{ minHeight }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <div className={className}>
      {focused ? (
        <textarea
          ref={taRef}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          style={{ minHeight }}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onBlur={() => setFocused(false)}
          onKeyDown={onKeyDown}
        />
      ) : (
        <button
          type="button"
          className={previewClasses}
          style={{ minHeight }}
          onClick={() => setFocused(true)}
        >
          {value.trim() ? (
            <span
              className="block text-left pointer-events-none"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          ) : (
            <span className="text-muted-foreground italic">{placeholder}</span>
          )}
        </button>
      )}
    </div>
  );
}

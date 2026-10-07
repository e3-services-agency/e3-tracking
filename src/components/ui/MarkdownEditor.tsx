/**
 * `MarkdownEditor` (D-71, T-5-05): the one comment editor. A plain textarea with a toolbar (bold,
 * italic, strikethrough, code, link, lists, quote, task item, image-from-attachment), keyboard
 * shortcuts, Write / Preview tabs (Preview renders through `MarkdownView` with the same attachment
 * resolver as the final render), list auto-continue on Enter and Tab / Shift+Tab indent in lists.
 * All text manipulation is in `src/domain/markdownEdit.ts` (pure, unit-tested); this file only maps
 * keys and clicks onto it. Fits the side-panel width: the toolbar wraps.
 */
import React, { useLayoutEffect, useRef, useState } from 'react';
import { Bold, CheckSquare, Code, Image as ImageIcon, Italic, Link as LinkIcon, List, ListOrdered, Quote, Strikethrough } from 'lucide-react';
import { Tooltip } from '@/src/components/ui/Tooltip';
import { MarkdownView } from '@/src/components/ui/MarkdownView';
import {
  attachmentImageMarkdown,
  continueList,
  indentList,
  insertLink,
  insertText,
  toggleLinePrefix,
  wrapSelection,
  type EditState,
} from '@/src/domain/markdownEdit';

export interface EditorAttachment {
  id: string;
  /** Short label for the Image dropdown (file name or "Image 1"). */
  label: string;
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform || '');
const MOD = isMac ? 'Cmd' : 'Ctrl';

export function MarkdownEditor({
  value,
  onChange,
  onSubmit,
  placeholder,
  disabled,
  rows = 3,
  maxLength,
  ariaLabel = 'Comment',
  required,
  attachments = [],
  pendingNames = [],
  resolveImage,
  autoFocus,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Ctrl/Cmd+Enter. */
  onSubmit?: () => void;
  placeholder?: string;
  disabled?: boolean;
  rows?: number;
  maxLength?: number;
  ariaLabel?: string;
  required?: boolean;
  /** Already-attached images the Image button can reference inline. */
  attachments?: EditorAttachment[];
  /** Picked-but-not-uploaded files (shown disabled in the Image menu: they get an id only after posting). */
  pendingNames?: string[];
  /** Same resolver the final render uses, so Preview matches. */
  resolveImage?: (src: string | undefined) => string | null;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const pendingSel = useRef<{ start: number; end: number } | null>(null);
  const [tab, setTab] = useState<'write' | 'preview'>('write');
  const [imageMenu, setImageMenu] = useState(false);

  useLayoutEffect(() => {
    if (pendingSel.current && ref.current) {
      ref.current.focus();
      ref.current.setSelectionRange(pendingSel.current.start, pendingSel.current.end);
      pendingSel.current = null;
    }
  });

  const apply = (next: EditState) => {
    const clipped = maxLength && next.text.length > maxLength ? null : next;
    if (!clipped) return;
    pendingSel.current = { start: clipped.start, end: clipped.end };
    onChange(clipped.text);
  };
  const state = (): EditState => {
    const el = ref.current;
    return { text: value, start: el?.selectionStart ?? value.length, end: el?.selectionEnd ?? value.length };
  };

  const actions = {
    bold: () => apply(wrapSelection(state(), '**')),
    italic: () => apply(wrapSelection(state(), '_')),
    strike: () => apply(wrapSelection(state(), '~~')),
    code: () => apply(wrapSelection(state(), '`')),
    link: () => apply(insertLink(state())),
    bullet: () => apply(toggleLinePrefix(state(), 'bullet')),
    number: () => apply(toggleLinePrefix(state(), 'number')),
    quote: () => apply(toggleLinePrefix(state(), 'quote')),
    task: () => apply(toggleLinePrefix(state(), 'task')),
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && e.key === 'Enter') {
      e.preventDefault();
      onSubmit?.();
      return;
    }
    if (mod && !e.shiftKey && !e.altKey && k === 'b') { e.preventDefault(); actions.bold(); return; }
    if (mod && !e.shiftKey && !e.altKey && k === 'i') { e.preventDefault(); actions.italic(); return; }
    if (mod && !e.shiftKey && !e.altKey && k === 'k') { e.preventDefault(); actions.link(); return; }
    if (mod && !e.shiftKey && !e.altKey && k === 'e') { e.preventDefault(); actions.code(); return; }
    if (mod && e.shiftKey && k === 'x') { e.preventDefault(); actions.strike(); return; }
    if (e.key === 'Enter' && !e.shiftKey && !mod && !e.altKey) {
      const next = continueList(state());
      if (next) {
        e.preventDefault();
        apply(next);
      }
      return;
    }
    if (e.key === 'Tab' && !mod && !e.altKey) {
      const next = indentList(state(), e.shiftKey);
      if (next) {
        e.preventDefault();
        apply(next);
      }
    }
  };

  const btn = (label: string, shortcut: string | null, onClick: () => void, icon: React.ReactNode) => (
    <Tooltip content={shortcut ? `${label} (${shortcut})` : label}>
      <button
        type="button"
        aria-label={label}
        disabled={disabled || tab === 'preview'}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className="inline-flex h-7 w-7 items-center justify-center rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40"
      >
        {icon}
      </button>
    </Tooltip>
  );

  const tabBtn = (id: 'write' | 'preview', label: string) => (
    <button
      type="button"
      role="tab"
      aria-selected={tab === id}
      onClick={() => setTab(id)}
      className={`h-7 rounded-t px-2 text-xs font-medium ${tab === id ? 'bg-white text-gray-900 border border-b-0 border-gray-300' : 'text-gray-500 hover:text-gray-800'}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-1" data-testid="markdown-editor">
      <div className="flex flex-wrap items-center gap-0.5">
        <div role="tablist" aria-label="Editor mode" className="mr-2 flex gap-1">
          {tabBtn('write', 'Write')}
          {tabBtn('preview', 'Preview')}
        </div>
        {btn('Bold', `${MOD}+B`, actions.bold, <Bold className="h-4 w-4" />)}
        {btn('Italic', `${MOD}+I`, actions.italic, <Italic className="h-4 w-4" />)}
        {btn('Strikethrough', `${MOD}+Shift+X`, actions.strike, <Strikethrough className="h-4 w-4" />)}
        {btn('Inline code', `${MOD}+E`, actions.code, <Code className="h-4 w-4" />)}
        {btn('Link', `${MOD}+K`, actions.link, <LinkIcon className="h-4 w-4" />)}
        {btn('Bulleted list', null, actions.bullet, <List className="h-4 w-4" />)}
        {btn('Numbered list', null, actions.number, <ListOrdered className="h-4 w-4" />)}
        {btn('Quote', null, actions.quote, <Quote className="h-4 w-4" />)}
        {btn('Task item', null, actions.task, <CheckSquare className="h-4 w-4" />)}
        <span className="relative">
          {btn('Insert attached image', null, () => setImageMenu((o) => !o), <ImageIcon className="h-4 w-4" />)}
          {imageMenu && (
            <ul
              role="menu"
              className="absolute left-0 top-8 z-20 min-w-40 rounded-md border border-gray-200 bg-white py-1 text-xs shadow-lg"
              onMouseLeave={() => setImageMenu(false)}
            >
              {attachments.length === 0 && pendingNames.length === 0 && <li className="px-3 py-1 text-gray-500">No attached images yet.</li>}
              {attachments.map((a) => (
                <li key={a.id} role="none">
                  <button
                    type="button"
                    role="menuitem"
                    className="block w-full px-3 py-1 text-left hover:bg-gray-100"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      apply(insertText(state(), attachmentImageMarkdown(a.id, a.label)));
                      setImageMenu(false);
                    }}
                  >
                    {a.label}
                  </button>
                </li>
              ))}
              {pendingNames.map((n, i) => (
                <li key={`${n}-${i}`} role="none" className="px-3 py-1 text-gray-400" title="Available to insert once the comment is posted">
                  {n} (after posting)
                </li>
              ))}
            </ul>
          )}
        </span>
      </div>
      {tab === 'write' ? (
        <textarea
          ref={ref}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          maxLength={maxLength}
          rows={rows}
          required={required}
          autoFocus={autoFocus}
          aria-label={ariaLabel}
          className="w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm font-mono"
        />
      ) : (
        <div className="min-h-16 rounded-md border border-gray-300 bg-white px-2 py-1.5" data-testid="markdown-preview">
          {value.trim() ? <MarkdownView source={value} resolveImage={resolveImage ?? (() => null)} /> : <p className="text-sm text-gray-400">Nothing to preview.</p>}
        </div>
      )}
      <p className="text-[11px] text-gray-400">
        Markdown supported. {MOD}+Enter posts.{maxLength ? ` ${value.length}/${maxLength}` : ''}
      </p>
    </div>
  );
}

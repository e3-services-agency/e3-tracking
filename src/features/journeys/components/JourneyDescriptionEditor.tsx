import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleHelp, Maximize2 } from 'lucide-react';
import { Sheet } from '@/src/components/ui/Sheet';
import { Button } from '@/src/components/ui/Button';
import { JourneyDescriptionMarkdown } from '@/src/features/journeys/components/JourneyDescriptionMarkdown';
import { handleJourneyDescriptionKeyDown } from '@/src/features/journeys/lib/journeyDescriptionShortcuts';

type JourneyDescriptionEditorProps = {
  /** Stable id (e.g. node id) so draft resets when switching nodes */
  anchorId: string;
  value: string;
  onCommit: (next: string) => void;
  readOnly: boolean;
  placeholder: string;
  /** Classes for the inline textarea */
  textareaClassName?: string;
  /** Optional wrapper for read-only block (step node uses min-h) */
  readOnlyContainerClassName?: string;
};

export function JourneyDescriptionEditor({
  anchorId,
  value,
  onCommit,
  readOnly,
  placeholder,
  textareaClassName = 'w-full text-xs text-gray-600 bg-white border rounded p-1 resize-none h-16 nodrag',
  readOnlyContainerClassName = 'w-full text-xs text-gray-700 bg-white border rounded p-2 min-h-[3.5rem] min-w-0 max-w-full overflow-hidden',
}: JourneyDescriptionEditorProps) {
  const [draft, setDraft] = useState(value ?? '');
  const [focused, setFocused] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDraft, setSheetDraft] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const helpWrapRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const sheetTextareaRef = useRef<HTMLTextAreaElement>(null);
  const inlineSelRestoreRef = useRef<{ start: number; end: number } | null>(null);
  const sheetSelRestoreRef = useRef<{ start: number; end: number } | null>(null);
  const prevFocusedRef = useRef(false);

  useEffect(() => {
    if (!focused) {
      setDraft(value ?? '');
    }
  }, [value, anchorId, focused]);

  useLayoutEffect(() => {
    const becameFocused = focused && !prevFocusedRef.current;
    prevFocusedRef.current = focused;
    if (!becameFocused) return;
    const ta = textareaRef.current;
    if (!ta) return;
    ta.focus();
    const n = ta.value.length;
    ta.setSelectionRange(n, n);
  }, [focused]);

  useLayoutEffect(() => {
    if (!focused) return;
    const r = inlineSelRestoreRef.current;
    if (!r) return;
    inlineSelRestoreRef.current = null;
    textareaRef.current?.setSelectionRange(r.start, r.end);
  }, [draft, focused]);

  useLayoutEffect(() => {
    if (!sheetOpen) return;
    const r = sheetSelRestoreRef.current;
    if (!r) return;
    sheetSelRestoreRef.current = null;
    sheetTextareaRef.current?.setSelectionRange(r.start, r.end);
  }, [sheetDraft, sheetOpen]);

  useEffect(() => {
    if (!helpOpen) return;
    const onDown = (e: MouseEvent) => {
      if (helpWrapRef.current && !helpWrapRef.current.contains(e.target as Node)) {
        setHelpOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [helpOpen]);

  const commitIfChanged = useCallback(() => {
    const next = draft;
    if (next !== (value ?? '')) onCommit(next);
  }, [draft, value, onCommit]);

  const onInlineShortcutCommit = useCallback((next: string, selStart: number, selEnd: number) => {
    inlineSelRestoreRef.current = { start: selStart, end: selEnd };
    setDraft(next);
  }, []);

  const onSheetShortcutCommit = useCallback((next: string, selStart: number, selEnd: number) => {
    sheetSelRestoreRef.current = { start: selStart, end: selEnd };
    setSheetDraft(next);
  }, []);

  const openSheet = () => {
    setSheetDraft(draft);
    setSheetOpen(true);
  };

  const saveSheet = () => {
    setDraft(sheetDraft);
    onCommit(sheetDraft);
    setSheetOpen(false);
    setFocused(false);
  };

  if (readOnly) {
    const empty = !(value ?? '').trim();
    return (
      <div className={readOnlyContainerClassName}>
        {empty ? (
          <span className="text-gray-400">—</span>
        ) : (
          <JourneyDescriptionMarkdown text={value ?? ''} className="text-xs" />
        )}
      </div>
    );
  }

  const previewEmpty = !(value ?? '').trim();

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex items-center justify-end gap-0.5 mb-1">
        <div className="relative shrink-0" ref={helpWrapRef}>
          <button
            type="button"
            className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 nodrag"
            aria-label="Markdown formatting help"
            aria-expanded={helpOpen}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setHelpOpen((v) => !v)}
          >
            <CircleHelp className="w-3.5 h-3.5" />
          </button>
          {helpOpen && (
            <div
              className="absolute right-0 top-full z-[60] mt-1 w-64 rounded-md border border-gray-200 bg-white p-2.5 text-[11px] text-gray-700 shadow-lg leading-snug"
              role="tooltip"
            >
              <div className="font-semibold text-gray-900 mb-1.5">Markdown</div>
              <ul className="space-y-1 list-none pl-0">
                <li>
                  <kbd className="text-[10px] bg-gray-100 px-1 rounded">⌘/Ctrl+B</kbd> bold,{' '}
                  <kbd className="text-[10px] bg-gray-100 px-1 rounded">⌘/Ctrl+I</kbd> italic
                </li>
                <li>
                  <kbd className="text-[10px] bg-gray-100 px-1 rounded">⌘/Ctrl+Shift+8</kbd> bullet
                  list
                </li>
                <li>
                  <kbd className="text-[10px] bg-gray-100 px-1 rounded">⌘/Ctrl+Shift+7</kbd> or{' '}
                  <kbd className="text-[10px] bg-gray-100 px-1 rounded">+Shift+1</kbd> numbered list
                </li>
                <li>
                  <code className="text-[10px] bg-gray-100 px-1 rounded">**bold**</code>,{' '}
                  <code className="text-[10px] bg-gray-100 px-1 rounded">*italic*</code>
                </li>
                <li>
                  <code className="text-[10px] bg-gray-100 px-1 rounded">- item</code> lists; blank
                  line for new paragraph
                </li>
              </ul>
            </div>
          )}
        </div>
        <button
          type="button"
          className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 nodrag"
          title="Open larger editor"
          aria-label="Open larger editor"
          onClick={openSheet}
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {focused ? (
        <textarea
          ref={textareaRef}
          placeholder={placeholder}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) =>
            handleJourneyDescriptionKeyDown(e, draft, onInlineShortcutCommit)
          }
          onBlur={() => {
            setFocused(false);
            commitIfChanged();
          }}
          className={textareaClassName}
        />
      ) : (
        <div
          role="textbox"
          tabIndex={0}
          aria-readonly="true"
          aria-multiline="true"
          aria-label={`${placeholder} — click to edit`}
          className={`${textareaClassName} cursor-text overflow-y-auto overflow-x-hidden [overflow-wrap:anywhere] flex flex-col items-stretch justify-start`}
          onMouseDown={(e) => {
            e.preventDefault();
            setDraft(value ?? '');
            setFocused(true);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              setDraft(value ?? '');
              setFocused(true);
            }
          }}
        >
          {previewEmpty ? (
            <span className="text-gray-400">{placeholder}</span>
          ) : (
            <JourneyDescriptionMarkdown text={value ?? ''} className="text-xs" />
          )}
        </div>
      )}

      <Sheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Edit description"
        className="w-full max-w-lg sm:max-w-xl"
      >
        <p className="text-xs text-gray-500 mb-2">
          Markdown: <strong>**bold**</strong>, <em>*italic*</em>, lists (
          <code className="bg-gray-100 px-1 rounded text-[11px]">- item</code>,{' '}
          <code className="bg-gray-100 px-1 rounded text-[11px]">1. item</code>). Shortcuts:{' '}
          <kbd className="text-[10px] bg-gray-100 px-1 rounded">⌘/Ctrl+B</kbd>,{' '}
          <kbd className="text-[10px] bg-gray-100 px-1 rounded">⌘/Ctrl+I</kbd>,{' '}
          <kbd className="text-[10px] bg-gray-100 px-1 rounded">⌘/Ctrl+Shift+8</kbd>,{' '}
          <kbd className="text-[10px] bg-gray-100 px-1 rounded">⌘/Ctrl+Shift+7</kbd> /{' '}
          <kbd className="text-[10px] bg-gray-100 px-1 rounded">+Shift+1</kbd>.
        </p>
        <textarea
          ref={sheetTextareaRef}
          value={sheetDraft}
          onChange={(e) => setSheetDraft(e.target.value)}
          onKeyDown={(e) =>
            handleJourneyDescriptionKeyDown(e, sheetDraft, onSheetShortcutCommit)
          }
          className="w-full min-h-[min(60vh,28rem)] max-h-[70vh] text-sm text-gray-800 border border-gray-200 rounded-md p-3 font-mono leading-relaxed resize-y min-w-0 max-w-full [overflow-wrap:anywhere]"
          placeholder={placeholder}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
            Cancel
          </Button>
          <Button type="button" onClick={saveSheet}>
            Save
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

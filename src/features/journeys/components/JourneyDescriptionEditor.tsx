import React, { useCallback, useEffect, useRef, useState } from 'react';
import { CircleHelp, Maximize2 } from 'lucide-react';
import { Sheet } from '@/src/components/ui/Sheet';
import { Button } from '@/src/components/ui/Button';
import { JourneyDescriptionMarkdown } from '@/src/features/journeys/components/JourneyDescriptionMarkdown';

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
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetDraft, setSheetDraft] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const helpWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraft(value ?? '');
  }, [value, anchorId]);

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

  const openSheet = () => {
    setSheetDraft(draft);
    setSheetOpen(true);
  };

  const saveSheet = () => {
    setDraft(sheetDraft);
    onCommit(sheetDraft);
    setSheetOpen(false);
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

  return (
    <div className="min-w-0 max-w-full">
      <div className="flex items-center justify-end gap-0.5 mb-1">
        <div className="relative shrink-0" ref={helpWrapRef}>
          <button
            type="button"
            className="p-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 nodrag"
            aria-label="Markdown formatting help"
            aria-expanded={helpOpen}
            onClick={() => setHelpOpen((v) => !v)}
          >
            <CircleHelp className="w-3.5 h-3.5" />
          </button>
          {helpOpen && (
            <div
              className="absolute right-0 top-full z-[60] mt-1 w-56 rounded-md border border-gray-200 bg-white p-2.5 text-[11px] text-gray-700 shadow-lg leading-snug"
              role="tooltip"
            >
              <div className="font-semibold text-gray-900 mb-1.5">Markdown</div>
              <ul className="space-y-1 list-none pl-0">
                <li>
                  <code className="text-[10px] bg-gray-100 px-1 rounded">**bold**</code> for bold
                </li>
                <li>
                  <code className="text-[10px] bg-gray-100 px-1 rounded">- item</code> for bullet
                  lists
                </li>
                <li>Blank line between blocks for a new paragraph</li>
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

      <textarea
        placeholder={placeholder}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitIfChanged}
        className={textareaClassName}
      />

      <Sheet
        isOpen={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Edit description"
        className="w-full max-w-lg sm:max-w-xl"
      >
        <p className="text-xs text-gray-500 mb-2">
          Markdown supported: <strong>**bold**</strong>, bullet lists (
          <code className="bg-gray-100 px-1 rounded text-[11px]">- item</code>), blank lines for
          paragraphs.
        </p>
        <textarea
          value={sheetDraft}
          onChange={(e) => setSheetDraft(e.target.value)}
          className="w-full min-h-[min(60vh,28rem)] max-h-[70vh] text-sm text-gray-800 border border-gray-200 rounded-md p-3 font-mono leading-relaxed resize-y"
          placeholder={placeholder}
          autoFocus
        />
        <div className="flex justify-end gap-2 mt-4 pt-4 border-t border-gray-100">
          <Button type="button" variant="outline" onClick={() => setSheetOpen(false)}>
            Cancel
          </Button>
          <Button
            type="button"
            onClick={() => {
              saveSheet();
            }}
          >
            Save
          </Button>
        </div>
      </Sheet>
    </div>
  );
}

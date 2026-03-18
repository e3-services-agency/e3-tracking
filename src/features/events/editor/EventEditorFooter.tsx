import React from 'react';
import { Button } from '@/src/components/ui/Button';

type EventEditorFooterProps = {
  newComment: string;
  onChangeComment: (value: string) => void;
  onCommentKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  canArchive: boolean;
  onArchive: () => void;
  onSave: () => void;
};

export function EventEditorFooter({
  newComment,
  onChangeComment,
  onCommentKeyDown,
  canArchive,
  onArchive,
  onSave,
}: EventEditorFooterProps) {
  return (
    <div className="absolute bottom-0 w-full bg-white border-t border-gray-200 p-4 flex gap-4 items-center shadow-[0_-4px_15px_-1px_rgba(0,0,0,0.05)] z-40 px-8">
      <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-xs shrink-0">
        JA
      </div>
      <input
        placeholder="Write a comment on this event... (Press Enter to post)"
        className="flex-1 text-[14px] bg-transparent border-none focus:ring-0 outline-none text-gray-800 placeholder:text-gray-400"
        value={newComment}
        onChange={(e) => onChangeComment(e.target.value)}
        onKeyDown={onCommentKeyDown}
      />
      <div className="flex gap-3">
        {canArchive && (
          <Button
            variant="outline"
            onClick={onArchive}
            className="h-10 text-[14px] font-bold text-red-600 border-red-200 hover:bg-red-50 px-5"
          >
            Archive Event
          </Button>
        )}
        <Button
          onClick={onSave}
          className="h-10 text-[14px] font-bold shadow-sm rounded-lg px-8"
        >
          Save
        </Button>
      </div>
    </div>
  );
}


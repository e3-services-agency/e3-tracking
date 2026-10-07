/**
 * Comment images (D-70 item 4, T-5-04): `CommentAttachments` is the thumbnail strip a comment row
 * renders (max 3 visible plus "+n", opening a plain overlay lightbox: Escape closes, arrows step);
 * `AttachmentPicker` is the composer's drop/paste/browse zone with client-side type and size checks
 * (the server re-checks by magic bytes); `uploadAttachments` posts the picked files one at a time
 * after the comment exists and reports progress. Limits mirror
 * `src/backend/services/commentAttachments.service.ts` (kept as constants here because the frontend
 * does not import backend code).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ImagePlus } from 'lucide-react';
import { FieldLabel } from '@/src/components/ui/FieldHint';
import { lightboxStep } from '@/src/features/shared/viewHelpers';

export const COMMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const COMMENT_IMAGE_MAX_COUNT = 10;
export const COMMENT_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
const VISIBLE_THUMBS = 3;

export interface CommentAttachmentItem {
  id: string;
  file_path: string;
  mime: string;
  width: number;
  height: number;
}

/** Returns an error message for a file the server would refuse, else null. */
export function checkCommentImage(file: { type: string; size: number; name: string }): string | null {
  if (!(COMMENT_IMAGE_TYPES as readonly string[]).includes(file.type)) return `${file.name}: only PNG, JPEG and WebP images are accepted.`;
  if (file.size > COMMENT_IMAGE_MAX_BYTES) return `${file.name}: larger than 5 MB.`;
  return null;
}

export function CommentAttachments({ attachments, fileUrl }: { attachments?: CommentAttachmentItem[]; fileUrl: (path: string) => string }) {
  const items = attachments ?? [];
  const [open, setOpen] = useState<number | null>(null);
  const close = useCallback(() => setOpen(null), []);
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (open === null) return;
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowRight') setOpen((i) => (i === null ? i : lightboxStep(i, 1, items.length)));
      else if (e.key === 'ArrowLeft') setOpen((i) => (i === null ? i : lightboxStep(i, -1, items.length)));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, items.length, close]);

  if (items.length === 0) return null;
  const extra = items.length - VISIBLE_THUMBS;
  const current = open === null ? null : items[open];
  return (
    <>
      <div className="mt-2 flex flex-wrap items-center gap-2" data-testid="comment-attachments">
        {items.slice(0, VISIBLE_THUMBS).map((a, i) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setOpen(i)}
            className="shrink-0 overflow-hidden rounded border hover:ring-2 hover:ring-[var(--color-info)]"
            aria-label={`Enlarge image ${i + 1} of ${items.length}`}
          >
            <img src={fileUrl(a.file_path)} alt={`Comment image ${i + 1}`} className="h-16 w-auto max-w-32 object-cover block" />
          </button>
        ))}
        {extra > 0 && (
          <button
            type="button"
            onClick={() => setOpen(VISIBLE_THUMBS)}
            className="h-16 rounded border bg-white px-3 text-xs font-medium text-gray-600 hover:bg-gray-50"
            aria-label={`Show ${extra} more images`}
          >
            +{extra}
          </button>
        )}
      </div>
      {current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Comment image"
          ref={dialogRef}
          tabIndex={-1}
          className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-black/80 p-6"
          onClick={close}
        >
          <img src={fileUrl(current.file_path)} alt="Comment image" className="max-h-[80vh] max-w-full rounded shadow-lg" onClick={(e) => e.stopPropagation()} />
          <p className="mt-3 text-sm text-white" onClick={(e) => e.stopPropagation()}>
            {(open ?? 0) + 1} / {items.length}
          </p>
          <div className="mt-2 flex gap-2" onClick={(e) => e.stopPropagation()}>
            {items.length > 1 && (
              <>
                <button type="button" className="rounded bg-white px-3 py-1 text-sm" onClick={() => setOpen((i) => lightboxStep(i ?? 0, -1, items.length))}>
                  Previous
                </button>
                <button type="button" className="rounded bg-white px-3 py-1 text-sm" onClick={() => setOpen((i) => lightboxStep(i ?? 0, 1, items.length))}>
                  Next
                </button>
              </>
            )}
            <button type="button" className="rounded bg-white px-3 py-1 text-sm" onClick={close}>
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}

/** Composer zone: drop, paste (Ctrl+V on the zone) or browse; holds the picked files until the comment is posted. */
export function AttachmentPicker({
  files,
  onChange,
  disabled,
  progress,
}: {
  files: File[];
  onChange: (next: File[]) => void;
  disabled?: boolean;
  /** "Uploading 2 of 3" while `uploadAttachments` runs. */
  progress?: string | null;
}) {
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const add = (incoming: FileList | File[]) => {
    const picked = Array.from(incoming);
    const accepted: File[] = [];
    const problems: string[] = [];
    for (const file of picked) {
      const problem = checkCommentImage(file);
      if (problem) problems.push(problem);
      else if (files.length + accepted.length >= COMMENT_IMAGE_MAX_COUNT) problems.push(`At most ${COMMENT_IMAGE_MAX_COUNT} images per comment.`);
      else accepted.push(file);
    }
    setError(problems.length > 0 ? Array.from(new Set(problems)).join(' ') : null);
    if (accepted.length > 0) onChange([...files, ...accepted]);
  };

  return (
    <div className="space-y-1">
      <FieldLabel className="block text-xs text-gray-700" hintScope="Comments" hint="Attach images">
        Images (optional)
      </FieldLabel>
      <div
        tabIndex={0}
        data-testid="comment-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (!disabled) add(e.dataTransfer.files);
        }}
        onPaste={(e) => {
          const pasted = Array.from(e.clipboardData.files).filter((f) => f.type.startsWith('image/'));
          if (pasted.length > 0 && !disabled) {
            e.preventDefault();
            add(pasted);
          }
        }}
        onClick={() => !disabled && inputRef.current?.click()}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-2 text-xs ${
          dragging ? 'border-[var(--brand-primary)] bg-blue-50 text-gray-900' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
        }`}
      >
        <ImagePlus className="h-4 w-4" />
        {progress ?? 'Drop, paste or click to add PNG, JPEG or WebP (5 MB each, up to 10)'}
        <input
          ref={inputRef}
          type="file"
          accept={COMMENT_IMAGE_TYPES.join(',')}
          multiple
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.files) add(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {files.length > 0 && (
        <ul className="flex flex-wrap gap-1 text-[11px] text-gray-600" aria-label="Images to attach">
          {files.map((f, i) => (
            <li key={`${f.name}-${i}`} className="flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5">
              {f.name}
              <button type="button" disabled={disabled} aria-label={`Remove ${f.name}`} onClick={() => onChange(files.filter((_, j) => j !== i))} className="text-red-500">
                x
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Uploads one file per request, in order. Returns a list of failure messages (empty = all uploaded). */
export async function uploadAttachments(
  url: string,
  files: File[],
  doFetch: (url: string, init: RequestInit) => Promise<Response>,
  onProgress: (message: string | null) => void
): Promise<string[]> {
  const failures: string[] = [];
  for (let i = 0; i < files.length; i++) {
    onProgress(`Uploading image ${i + 1} of ${files.length}…`);
    const form = new FormData();
    form.append('file', files[i]);
    try {
      const res = await doFetch(url, { method: 'POST', body: form });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        failures.push(`${files[i].name}: ${typeof data?.error === 'string' ? data.error : 'upload failed.'}`);
      }
    } catch {
      failures.push(`${files[i].name}: upload failed. Check your connection.`);
    }
  }
  onProgress(null);
  return failures;
}

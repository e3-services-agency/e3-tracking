/**
 * Trigger screenshots editor (T-4-24, item 6): a drag-and-drop upload zone (click to browse works
 * too) that accepts several images at once, and a gallery with reorder and remove. Uploads go
 * through the local FileStore (D-14); the stored value is an ordered list of file paths.
 */
import React, { useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Upload, X } from 'lucide-react';
import { fetchWithAuth } from '@/src/lib/api';
import { API_BASE } from '@/src/config/env';
import { moveItem } from '@/src/domain/moveItem';

export function TriggerImagesEditor({
  projectId,
  images,
  onChange,
}: {
  projectId: string;
  images: string[];
  onChange: (next: string[]) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const upload = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (list.length === 0) {
      setError('Drop image files (png, jpg, gif, webp).');
      return;
    }
    setError(null);
    setUploading(true);
    const added: string[] = [];
    try {
      for (const file of list) {
        const form = new FormData();
        form.append('file', file);
        const res = await fetchWithAuth(`${API_BASE}/api/projects/${projectId}/files?kind=event_trigger`, { method: 'POST', body: form });
        const data = await res.json().catch(() => ({}));
        if (res.ok && typeof data.path === 'string') added.push(data.path);
        else setError(typeof data?.error === 'string' ? data.error : `Could not upload ${file.name}.`);
      }
    } finally {
      setUploading(false);
      if (added.length > 0) onChange([...images, ...added]);
    }
  };

  return (
    <div className="space-y-2">
      <div
        data-testid="trigger-dropzone"
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void upload(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
        className={`flex cursor-pointer items-center justify-center gap-2 rounded-md border-2 border-dashed px-3 py-4 text-sm ${
          dragging ? 'border-[var(--brand-primary)] bg-blue-50 text-gray-900' : 'border-gray-300 text-gray-500 hover:bg-gray-50'
        }`}
      >
        <Upload className="w-4 h-4" />
        {uploading ? 'Uploading…' : 'Drop images here or click to browse (several allowed)'}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.files) void upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {images.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Trigger images">
          {images.map((path, i) => (
            <li key={path} className="relative rounded border bg-white p-1">
              <img src={`${API_BASE}/api/projects/${projectId}/files/${path}`} alt={`Screenshot ${i + 1}`} className="h-20 w-auto rounded" />
              <div className="mt-1 flex items-center justify-between gap-1">
                <button type="button" disabled={i === 0} onClick={() => onChange(moveItem(images, i, i - 1))} aria-label="Move image earlier" className="text-gray-500 hover:text-gray-900 disabled:opacity-30">
                  <ArrowLeft className="w-4 h-4" />
                </button>
                <button type="button" onClick={() => onChange(images.filter((_, j) => j !== i))} aria-label="Remove image" className="text-red-500 hover:text-red-700">
                  <X className="w-4 h-4" />
                </button>
                <button type="button" disabled={i === images.length - 1} onClick={() => onChange(moveItem(images, i, i + 1))} aria-label="Move image later" className="text-gray-500 hover:text-gray-900 disabled:opacity-30">
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * Markdown helper shortcuts for journey description textareas (plain Markdown, not WYSIWYG).
 * Returns true if the event was handled (caller should preventDefault).
 */
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';

function replaceRange(
  value: string,
  start: number,
  end: number,
  insert: string,
): { next: string; selStart: number; selEnd: number } {
  const next = value.slice(0, start) + insert + value.slice(end);
  const len = insert.length;
  return { next, selStart: start, selEnd: start + len };
}

/** Toggle or insert **bold** around selection (or insert markers with cursor inside when empty). */
export function applyBoldShortcut(
  value: string,
  start: number,
  end: number,
): { next: string; selStart: number; selEnd: number } {
  const sel = value.slice(start, end);
  if (sel.length >= 4 && sel.startsWith('**') && sel.endsWith('**')) {
    const inner = sel.slice(2, -2);
    const { next } = replaceRange(value, start, end, inner);
    return { next, selStart: start, selEnd: start + inner.length };
  }
  const wrapped = `**${sel}**`;
  const { next } = replaceRange(value, start, end, wrapped);
  if (sel.length === 0) {
    const c = start + 2;
    return { next, selStart: c, selEnd: c };
  }
  return { next, selStart: start + wrapped.length, selEnd: start + wrapped.length };
}

/** Toggle or insert *italic* (single-asterisk, not **). */
export function applyItalicShortcut(
  value: string,
  start: number,
  end: number,
): { next: string; selStart: number; selEnd: number } {
  const sel = value.slice(start, end);
  if (
    sel.length >= 2 &&
    sel.startsWith('*') &&
    sel.endsWith('*') &&
    !sel.startsWith('**') &&
    !sel.endsWith('**')
  ) {
    const inner = sel.slice(1, -1);
    const { next } = replaceRange(value, start, end, inner);
    return { next, selStart: start, selEnd: start + inner.length };
  }
  const wrapped = `*${sel}*`;
  const { next } = replaceRange(value, start, end, wrapped);
  if (sel.length === 0) {
    const c = start + 1;
    return { next, selStart: c, selEnd: c };
  }
  return { next, selStart: start + wrapped.length, selEnd: start + wrapped.length };
}

/** Prepend "- " to each non-empty line in the line range covering the selection. */
export function applyBulletListShortcut(
  value: string,
  start: number,
  end: number,
): { next: string; selStart: number; selEnd: number } {
  const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEndIdx = value.indexOf('\n', end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const block = value.slice(lineStart, lineEnd);

  const lines = block.split('\n');
  const out = lines.map((line) => {
    const t = line.trimEnd();
    if (t === '') return line;
    const trimmed = t.trimStart();
    if (/^-\s+/.test(trimmed)) return line;
    const lead = line.match(/^\s*/)?.[0] ?? '';
    const rest = line.slice(lead.length);
    return `${lead}- ${rest}`;
  });
  const newBlock = out.join('\n');
  const { next } = replaceRange(value, lineStart, lineEnd, newBlock);
  const delta = newBlock.length - block.length;
  return {
    next,
    selStart: Math.min(start + delta, next.length),
    selEnd: Math.min(end + delta, next.length),
  };
}

/** Prepend "1. " pattern to lines (ordered list). */
export function applyOrderedListShortcut(
  value: string,
  start: number,
  end: number,
): { next: string; selStart: number; selEnd: number } {
  const lineStart = value.lastIndexOf('\n', start - 1) + 1;
  const lineEndIdx = value.indexOf('\n', end);
  const lineEnd = lineEndIdx === -1 ? value.length : lineEndIdx;
  const block = value.slice(lineStart, lineEnd);
  const lines = block.split('\n');
  let n = 1;
  const out = lines.map((line) => {
    const t = line.trimEnd();
    if (t === '') return line;
    const trimmed = t.trimStart();
    if (/^\d+\.\s+/.test(trimmed)) return line;
    const lead = line.match(/^\s*/)?.[0] ?? '';
    const rest = line.slice(lead.length);
    const prefix = `${n}. `;
    n += 1;
    return `${lead}${prefix}${rest}`;
  });
  const newBlock = out.join('\n');
  const { next } = replaceRange(value, lineStart, lineEnd, newBlock);
  const delta = newBlock.length - block.length;
  return {
    next,
    selStart: start + delta,
    selEnd: end + delta,
  };
}

export type ShortcutCommit = (next: string, selStart: number, selEnd: number) => void;

/**
 * Handle Ctrl/Cmd shortcuts. Invokes commit with new value + selection when handled.
 */
export function handleJourneyDescriptionKeyDown(
  e: ReactKeyboardEvent<HTMLTextAreaElement>,
  value: string,
  commit: ShortcutCommit,
): boolean {
  const meta = e.ctrlKey || e.metaKey;
  if (!meta || e.altKey) return false;

  const ta = e.currentTarget as HTMLTextAreaElement;
  const start = ta.selectionStart;
  const end = ta.selectionEnd;

  // Bold: Cmd/Ctrl+B
  if (!e.shiftKey && (e.key === 'b' || e.key === 'B')) {
    e.preventDefault();
    const r = applyBoldShortcut(value, start, end);
    commit(r.next, r.selStart, r.selEnd);
    return true;
  }

  // Italic: Cmd/Ctrl+I
  if (!e.shiftKey && (e.key === 'i' || e.key === 'I')) {
    e.preventDefault();
    const r = applyItalicShortcut(value, start, end);
    commit(r.next, r.selStart, r.selEnd);
    return true;
  }

  // Bullet: Cmd/Ctrl+Shift+8 (physical key; layout-independent)
  if (e.shiftKey && e.code === 'Digit8') {
    e.preventDefault();
    const r = applyBulletListShortcut(value, start, end);
    commit(r.next, r.selStart, r.selEnd);
    return true;
  }

  // Ordered: Cmd/Ctrl+Shift+7 or Shift+1
  if (e.shiftKey && (e.code === 'Digit7' || e.code === 'Digit1')) {
    e.preventDefault();
    const r = applyOrderedListShortcut(value, start, end);
    commit(r.next, r.selStart, r.selEnd);
    return true;
  }

  return false;
}

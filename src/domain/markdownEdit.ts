/**
 * Pure text-editing helpers behind `MarkdownEditor` (D-71, T-5-05). Each takes the textarea value
 * and selection and returns the new value and selection; none touch the DOM.
 */
export interface EditState {
  text: string;
  start: number;
  end: number;
}

/** Comment body limit, mirrored by the server (`comment.dal.ts`). */
export const COMMENT_BODY_MAX = 10000;

/** Wraps the selection in `before`/`after`; unwraps when already wrapped (markers inside or around the selection). */
export function wrapSelection(s: EditState, before: string, after: string = before): EditState {
  const { text, start, end } = s;
  const sel = text.slice(start, end);
  if (sel.length >= before.length + after.length && sel.startsWith(before) && sel.endsWith(after)) {
    const inner = sel.slice(before.length, sel.length - after.length);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  if (start >= before.length && text.slice(start - before.length, start) === before && text.slice(end, end + after.length) === after) {
    return {
      text: text.slice(0, start - before.length) + sel + text.slice(end + after.length),
      start: start - before.length,
      end: end - before.length,
    };
  }
  return { text: text.slice(0, start) + before + sel + after + text.slice(end), start: start + before.length, end: end + before.length };
}

export type LineKind = 'bullet' | 'number' | 'quote' | 'task';
const LINE_PREFIX_RE = /^(\s*)(?:- \[[ xX]\] |[-*+] |\d+\. |> )/;

function prefixFor(kind: LineKind, index: number): string {
  if (kind === 'bullet') return '- ';
  if (kind === 'number') return `${index + 1}. `;
  if (kind === 'task') return '- [ ] ';
  return '> ';
}

function prefixPattern(kind: LineKind): RegExp {
  if (kind === 'bullet') return /^(\s*)[-*+] (?!\[[ xX]\] )/;
  if (kind === 'number') return /^(\s*)\d+\. /;
  if (kind === 'task') return /^(\s*)- \[[ xX]\] /;
  return /^(\s*)> /;
}

/** Toggles a list/quote prefix on every line the selection touches (removes it when all lines have it). */
export function toggleLinePrefix(s: EditState, kind: LineKind): EditState {
  const { text, start, end } = s;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = text.length;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  const re = prefixPattern(kind);
  const allHave = lines.every((l) => re.test(l));
  const out = lines.map((l, i) => {
    if (allHave) return l.replace(re, '$1');
    return prefixFor(kind, i) + l.replace(LINE_PREFIX_RE, '$1');
  });
  const joined = out.join('\n');
  return { text: text.slice(0, lineStart) + joined + text.slice(lineEnd), start: lineStart, end: lineStart + joined.length };
}

/**
 * Enter pressed with a collapsed caret: continues a list/quote on the next line, or (on an empty
 * item) removes the marker. Returns null when the line is not a list item (default Enter applies).
 */
export function continueList(s: EditState): EditState | null {
  const { text, start, end } = s;
  if (start !== end) return null;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  const line = text.slice(lineStart, start);
  const m = /^(\s*)(- \[[ xX]\] |[-*+] |\d+\. |> )(.*)$/.exec(line);
  if (!m) return null;
  const [, indent, marker, rest] = m;
  if (rest.trim() === '') {
    if (indent.length >= 2) {
      const outdented = indent.slice(2);
      const caret = lineStart + outdented.length + marker.length;
      return { text: text.slice(0, lineStart) + outdented + marker + text.slice(start), start: caret, end: caret };
    }
    return { text: text.slice(0, lineStart) + text.slice(start), start: lineStart, end: lineStart };
  }
  let nextMarker = marker;
  const num = /^(\d+)\. $/.exec(marker);
  if (num) nextMarker = `${Number(num[1]) + 1}. `;
  else if (/^- \[[xX]\] $/.test(marker)) nextMarker = '- [ ] ';
  const insert = `\n${indent}${nextMarker}`;
  return { text: text.slice(0, start) + insert + text.slice(end), start: start + insert.length, end: start + insert.length };
}

/** Tab / Shift+Tab inside list lines: indents or outdents by two spaces. Null when a selected line is not a list item. */
export function indentList(s: EditState, outdent: boolean): EditState | null {
  const { text, start, end } = s;
  const lineStart = text.lastIndexOf('\n', start - 1) + 1;
  let lineEnd = text.indexOf('\n', end);
  if (lineEnd === -1) lineEnd = text.length;
  const lines = text.slice(lineStart, lineEnd).split('\n');
  if (!lines.every((l) => LINE_PREFIX_RE.test(l))) return null;
  let delta0 = 0;
  let total = 0;
  const out = lines.map((l, i) => {
    const next = outdent ? l.replace(/^ {1,2}/, '') : `  ${l}`;
    const d = next.length - l.length;
    if (i === 0) delta0 = d;
    total += d;
    return next;
  });
  const joined = out.join('\n');
  return {
    text: text.slice(0, lineStart) + joined + text.slice(lineEnd),
    start: Math.max(lineStart, start + delta0),
    end: Math.max(lineStart, end + total),
  };
}

/** Inserts a Markdown link; the URL part ends up selected so it can be typed over. */
export function insertLink(s: EditState, url = 'https://'): EditState {
  const { text, start, end } = s;
  const label = text.slice(start, end) || 'link text';
  const md = `[${label}](${url})`;
  const urlStart = start + label.length + 3;
  return { text: text.slice(0, start) + md + text.slice(end), start: urlStart, end: urlStart + url.length };
}

/** Inserts text at the selection, caret after it. */
export function insertText(s: EditState, insert: string): EditState {
  const { text, start, end } = s;
  const pos = start + insert.length;
  return { text: text.slice(0, start) + insert + text.slice(end), start: pos, end: pos };
}

/** `![alt](attachment:<id>)` for an already-attached image. */
export function attachmentImageMarkdown(id: string, alt: string): string {
  return `![${alt.replace(/[[\]]/g, '')}](attachment:${id})`;
}

const ATTACHMENT_SRC = /^attachment:(.+)$/;

/** Resolves an `attachment:<id>` image source to a served URL; null when the id is not attached. */
export function resolveAttachmentSrc(
  src: string | undefined,
  attachments: ReadonlyArray<{ id: string; file_path: string }> | undefined,
  fileUrl: (path: string) => string
): string | null {
  const m = src ? ATTACHMENT_SRC.exec(src) : null;
  if (!m) return null;
  const found = (attachments ?? []).find((a) => a.id === m[1]);
  return found ? fileUrl(found.file_path) : null;
}

/** Host of an absolute http(s) link for the muted suffix, else null. */
export function externalHost(href: string | undefined): string | null {
  if (!href || !/^https?:\/\//i.test(href)) return null;
  try {
    return new URL(href).host;
  } catch {
    return null;
  }
}

export const EXTERNAL_LINK_REL = 'noopener noreferrer nofollow';

/**
 * Minimal QA notes markdown → safe HTML (subset only). Shared by editor preview and shared docs export.
 * No raw HTML passthrough; links restricted to http(s) and mailto.
 */
import type { QARun, QAVerification } from '@/src/types';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function sanitizeQaNotesHref(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  if (/^https?:\/\//i.test(t)) return t;
  if (/^mailto:[^\s]+$/i.test(t)) return t;
  return null;
}

const PH = (n: number) => `\uE000${n}\uE001`;

function processTextSegment(s: string): string {
  const holders: string[] = [];
  let r = s;
  let hi = 0;
  const push = (html: string) => {
    const id = hi++;
    holders.push(html);
    return PH(id);
  };

  r = r.replace(/\[([^\]]*)\]\(([^)]+)\)/g, (full, text, url) => {
    const safe = sanitizeQaNotesHref(String(url));
    if (!safe) return escapeHtml(full);
    return push(
      '<a href="' +
        escapeHtml(safe) +
        '" target="_blank" rel="noopener noreferrer">' +
        escapeHtml(String(text)) +
        '</a>'
    );
  });
  r = r.replace(/\*\*([^*]+)\*\*/g, (_, t) => push('<strong>' + escapeHtml(t) + '</strong>'));
  r = r.replace(/(^|[^*])\*([^*\n]+)\*([^*]|$)/g, (m, a, b, c) => {
    return (a || '') + push('<em>' + escapeHtml(b) + '</em>') + (c || '');
  });
  r = r.replace(/(^|\s)_([^_\n]+)_(\s|$)/g, (m, a, b, c) => {
    return (a || '') + push('<em>' + escapeHtml(b) + '</em>') + (c || '');
  });

  r = escapeHtml(r);
  for (let i = 0; i < holders.length; i++) {
    r = r.replace(PH(i), holders[i]);
  }
  return r;
}

function parseInlineWithCode(raw: string): string {
  const parts: string[] = [];
  let i = 0;
  while (i < raw.length) {
    const bt = raw.indexOf('`', i);
    if (bt === -1) {
      parts.push(processTextSegment(raw.slice(i)));
      break;
    }
    if (bt > i) parts.push(processTextSegment(raw.slice(i, bt)));
    const end = raw.indexOf('`', bt + 1);
    if (end === -1) {
      parts.push(processTextSegment(raw.slice(bt)));
      break;
    }
    const code = raw.slice(bt + 1, end);
    parts.push('<code class="qa-md-code">' + escapeHtml(code) + '</code>');
    i = end + 1;
  }
  return parts.join('');
}

/**
 * Supported: #–####, **bold**, * / _italic_, `code`, [text](url), bullet/ordered lists, paragraphs.
 */
export function renderQaNotesMarkdownToHtml(md: string): string {
  const text = (md ?? '').replace(/\r\n/g, '\n');
  if (!text.trim()) return '';

  const lines = text.split('\n');
  const out: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed === '') {
      i++;
      continue;
    }

    const hm = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (hm) {
      const level = hm[1].length;
      const body = hm[2].replace(/\s+#+\s*$/, '').trim();
      out.push(
        `<h${level} class="qa-md-h">${parseInlineWithCode(body)}</h${level}>`
      );
      i++;
      continue;
    }

    if (/^\d+\.\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const olm = t.match(/^\d+\.\s+(.*)$/);
        if (!olm) break;
        items.push(`<li>${parseInlineWithCode(olm[1])}</li>`);
        i++;
      }
      out.push(`<ol class="qa-md-ol">${items.join('')}</ol>`);
      continue;
    }

    if (/^[-*]\s/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const t = lines[i].trim();
        const ulm = t.match(/^[-*]\s+(.*)$/);
        if (!ulm) break;
        items.push(`<li>${parseInlineWithCode(ulm[1])}</li>`);
        i++;
      }
      out.push(`<ul class="qa-md-ul">${items.join('')}</ul>`);
      continue;
    }

    const para: string[] = [];
    while (i < lines.length) {
      const t = lines[i];
      if (t.trim() === '') break;
      const tr = t.trim();
      if (/^#{1,4}\s/.test(tr)) break;
      if (/^\d+\.\s/.test(tr)) break;
      if (/^[-*]\s/.test(tr)) break;
      para.push(t);
      i++;
    }
    const inner = para.map((l) => parseInlineWithCode(l)).join('<br>\n');
    out.push(`<p class="qa-md-p">${inner}</p>`);
  }

  return out.join('\n');
}

/** Display-only HTML for iframe export; `notes` / `overallNotes` remain plain markdown in storage. */
export function augmentQaRunWithNotesHtml(qaRun: QARun): QARun & {
  __overallNotesHtml?: string;
} {
  const verifications: Record<string, QAVerification & { __notesHtml?: string }> = {};
  for (const [id, v] of Object.entries(qaRun.verifications || {})) {
    verifications[id] = {
      ...v,
      __notesHtml: renderQaNotesMarkdownToHtml(v.notes ?? ''),
    };
  }
  return {
    ...qaRun,
    verifications,
    __overallNotesHtml: renderQaNotesMarkdownToHtml(qaRun.overallNotes ?? ''),
  };
}

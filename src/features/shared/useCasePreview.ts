import React, { type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

const BLOCKS = new Set(['p', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'li', 'blockquote', 'pre', 'td', 'th', 'br']);
function nodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join('');
  if (!React.isValidElement<{ children?: ReactNode; alt?: string }>(node)) return '';
  if (node.type === 'img') return node.props.alt ?? '';
  const text = nodeText(node.props.children);
  return typeof node.type === 'string' && BLOCKS.has(node.type) ? ` ${text} ` : text;
}
/** Reuse the Markdown parser, read text only, skip raw HTML; no DOM/HTML parsing or injection. */
export function useCasePreview(markdown: string): string {
  const limit = 200;
  const plain = nodeText(Markdown({ children: markdown, remarkPlugins: [remarkGfm], skipHtml: true })).replace(/\s+/gu, ' ').trim();
  const characters = Array.from(plain);
  if (characters.length <= limit) return plain;
  const head = characters.slice(0, Math.max(0, limit - 1)).join('');
  const boundary = head.lastIndexOf(' ');
  return (boundary >= head.length * 0.6 ? head.slice(0, boundary) : head).trimEnd() + '…';
}

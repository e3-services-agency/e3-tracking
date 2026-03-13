/**
 * Shared utilities for generating safe HTML in handoff documents.
 */

export function escapeHtml(value: unknown): string {
  const str = typeof value === 'string' ? value : String(value ?? '');
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatDateTime(isoString: string): string {
  if (!isoString) return 'Unknown';
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return escapeHtml(isoString);
  return date.toLocaleString();
}

export type BadgeTone = 'neutral' | 'green' | 'red' | 'yellow' | 'blue';

const BADGE_TONE_STYLES: Record<BadgeTone, string> = {
  neutral: 'background:#f3f4f6;color:#374151;',
  green: 'background:#dcfce7;color:#166534;',
  red: 'background:#fee2e2;color:#991b1b;',
  yellow: 'background:#fef3c7;color:#92400e;',
  blue: 'background:#dbeafe;color:#1d4ed8;',
};

export function renderBadge(
  label: string,
  tone: BadgeTone = 'neutral'
): string {
  return `
    <span style="
      display:inline-block;
      padding:4px 8px;
      border-radius:999px;
      font-size:12px;
      font-weight:600;
      line-height:1;
      ${BADGE_TONE_STYLES[tone]}
    ">
      ${escapeHtml(label)}
    </span>
  `;
}

export function renderList(
  items: string[] | undefined | null,
  emptyLabel = '—'
): string {
  if (!items || items.length === 0) {
    return `<span style="color:#6b7280;">${escapeHtml(emptyLabel)}</span>`;
  }
  return items.map((item) => renderBadge(item, 'neutral')).join(' ');
}

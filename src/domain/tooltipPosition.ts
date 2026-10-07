/** Pure tooltip placement (T-4-29): below the anchor by default, above when it would overflow the
 * bottom edge, clamped horizontally into the viewport. No DOM access, so it is unit-testable. */
export interface Box { top: number; left: number; width: number; height: number }
export interface TooltipPlacement { top: number; left: number; placement: 'top' | 'bottom' }

export function computeTooltipPosition(
  anchor: Box,
  tip: { width: number; height: number },
  viewport: { width: number; height: number },
  gap = 6,
  margin = 8,
): TooltipPlacement {
  const fitsBelow = anchor.top + anchor.height + gap + tip.height <= viewport.height - margin;
  const fitsAbove = anchor.top - gap - tip.height >= margin;
  const placement: 'top' | 'bottom' = fitsBelow || !fitsAbove ? 'bottom' : 'top';
  const top = placement === 'bottom' ? anchor.top + anchor.height + gap : anchor.top - gap - tip.height;
  const centered = anchor.left + anchor.width / 2 - tip.width / 2;
  const maxLeft = Math.max(margin, viewport.width - margin - tip.width);
  const left = Math.min(Math.max(centered, margin), maxLeft);
  return { top: Math.max(margin, top), left, placement };
}

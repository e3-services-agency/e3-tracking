import { describe, expect, it } from 'vitest';
import { computeTooltipPosition } from './tooltipPosition';

const vp = { width: 1000, height: 800 };
const tip = { width: 200, height: 60 };

describe('computeTooltipPosition', () => {
  it('opens below and centred by default', () => {
    const p = computeTooltipPosition({ top: 100, left: 400, width: 20, height: 20 }, tip, vp);
    expect(p.placement).toBe('bottom');
    expect(p.top).toBe(126);
    expect(p.left).toBe(310);
  });
  it('flips above near the bottom edge', () => {
    const p = computeTooltipPosition({ top: 760, left: 400, width: 20, height: 20 }, tip, vp);
    expect(p.placement).toBe('top');
    expect(p.top).toBe(760 - 6 - 60);
  });
  it('clamps into the viewport horizontally', () => {
    expect(computeTooltipPosition({ top: 10, left: 0, width: 10, height: 10 }, tip, vp).left).toBe(8);
    expect(computeTooltipPosition({ top: 10, left: 995, width: 10, height: 10 }, tip, vp).left).toBe(792);
  });
  it('stays below when neither side fits', () => {
    const p = computeTooltipPosition({ top: 20, left: 10, width: 10, height: 10 }, { width: 100, height: 900 }, vp);
    expect(p.placement).toBe('bottom');
  });
});

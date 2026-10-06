import { describe, expect, it } from 'vitest';
import { parseSheetView, readSheetView, toggleSheetView, writeSheetView, SHEET_VIEW_KEY } from './sheetView';

const memory = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), m };
};

describe('sheet view preference', () => {
  it('defaults to panel for anything but modal', () => {
    expect(parseSheetView(null)).toBe('panel');
    expect(parseSheetView('weird')).toBe('panel');
    expect(parseSheetView('modal')).toBe('modal');
  });
  it('round-trips through storage under e3.sheet.view', () => {
    const s = memory();
    expect(readSheetView(s)).toBe('panel');
    writeSheetView(s, 'modal');
    expect(s.m.get(SHEET_VIEW_KEY)).toBe('modal');
    expect(SHEET_VIEW_KEY).toBe('e3.sheet.view');
    expect(readSheetView(s)).toBe('modal');
  });
  it('survives missing or throwing storage', () => {
    expect(readSheetView(null)).toBe('panel');
    const bad = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); } };
    expect(readSheetView(bad)).toBe('panel');
    expect(() => writeSheetView(bad, 'modal')).not.toThrow();
  });
  it('toggles', () => {
    expect(toggleSheetView('panel')).toBe('modal');
    expect(toggleSheetView('modal')).toBe('panel');
  });
});

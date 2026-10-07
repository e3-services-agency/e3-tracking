import { describe, expect, it, vi } from 'vitest';
import { swallowClick } from './FieldHint';

describe('HintIcon click (T-4-29 F1)', () => {
  it('prevents the default label activation and stops propagation', () => {
    const e = { preventDefault: vi.fn(), stopPropagation: vi.fn() };
    swallowClick(e);
    expect(e.preventDefault).toHaveBeenCalled();
    expect(e.stopPropagation).toHaveBeenCalled();
  });
});

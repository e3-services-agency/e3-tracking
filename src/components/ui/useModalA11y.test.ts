import { describe, expect, it } from 'vitest';
import { isTopModal, popModal, pushModal } from './useModalA11y';

describe('modal stack', () => {
  it('only the innermost dialog handles Esc, then the outer one after it closes', () => {
    const closed: string[] = [];
    const outer = pushModal();
    const inner = pushModal();
    const press = (name: string, id: symbol) => { if (isTopModal(id)) closed.push(name); };
    press('outer', outer);
    press('inner', inner);
    expect(closed).toEqual(['inner']);
    popModal(inner);
    press('outer', outer);
    expect(closed).toEqual(['inner', 'outer']);
    popModal(outer);
  });
});

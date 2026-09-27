import { describe, expect, it } from 'vitest';
import { getActor, runWithActor } from './actor';

describe('actor context (D-44, T-3-01)', () => {
  it('defaults to the system actor outside any runWithActor call', () => {
    expect(getActor()).toEqual({ actor: 'system', source: 'system' });
  });

  it('is visible to a synchronous getActor call inside runWithActor', () => {
    let seen: unknown;
    runWithActor({ actor: 'Ján Pan', source: 'ui' }, () => {
      seen = getActor();
    });
    expect(seen).toEqual({ actor: 'Ján Pan', source: 'ui' });
    // Restored to the default once the callback returns.
    expect(getActor()).toEqual({ actor: 'system', source: 'system' });
  });

  it('propagates through an async boundary (await, a promise, a microtask)', async () => {
    const seen: unknown[] = [];
    await runWithActor({ actor: 'agent-1', source: 'mcp', batch_id: 'b1' }, async () => {
      seen.push(getActor());
      await Promise.resolve();
      seen.push(getActor());
      await new Promise((resolve) => setTimeout(resolve, 0));
      seen.push(getActor());
    });
    expect(seen).toEqual([
      { actor: 'agent-1', source: 'mcp', batch_id: 'b1' },
      { actor: 'agent-1', source: 'mcp', batch_id: 'b1' },
      { actor: 'agent-1', source: 'mcp', batch_id: 'b1' },
    ]);
  });

  it('nested contexts do not leak into each other once the inner call returns', () => {
    runWithActor({ actor: 'outer', source: 'ui' }, () => {
      runWithActor({ actor: 'inner', source: 'import:data-mapping', batch_id: 'batch-1' }, () => {
        expect(getActor()).toEqual({ actor: 'inner', source: 'import:data-mapping', batch_id: 'batch-1' });
      });
      expect(getActor()).toEqual({ actor: 'outer', source: 'ui' });
    });
  });
});

import { describe, expect, it } from 'vitest';
import { getActor, runWithActor, runWithImportBatch } from './actor';

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

  describe('runWithImportBatch (T-3-02 pre-QA fix, INFO 6)', () => {
    it('sets source to import:<format> and a fresh batch_id, keeping the caller\'s actor', () => {
      let seen: unknown;
      const { result, batchId } = runWithImportBatch('data-mapping', () => {
        seen = getActor();
        return 42;
      });
      expect(result).toBe(42);
      expect(typeof batchId).toBe('string');
      expect(batchId.length).toBeGreaterThan(0);
      expect(seen).toEqual({ actor: 'system', source: 'import:data-mapping', batch_id: batchId });
      // Restored to the default once the callback returns.
      expect(getActor()).toEqual({ actor: 'system', source: 'system' });
    });

    it('layers onto an already-set actor (a human in the UI, or an MCP agent) without overwriting it', () => {
      let seen: unknown;
      runWithActor({ actor: 'Ján Pan', source: 'ui' }, () => {
        const { batchId } = runWithImportBatch('expiration-settings', () => {
          seen = getActor();
        });
        expect(seen).toEqual({ actor: 'Ján Pan', source: 'import:expiration-settings', batch_id: batchId });
      });
    });

    it('two calls get two distinct batch ids', () => {
      const first = runWithImportBatch('data-manager-events', () => getActor().batch_id);
      const second = runWithImportBatch('data-manager-events', () => getActor().batch_id);
      expect(first.batchId).not.toBe(second.batchId);
      expect(first.result).toBe(first.batchId);
      expect(second.result).toBe(second.batchId);
    });
  });
});

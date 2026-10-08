import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
let storage: Map<string, string>;
beforeEach(() => {
  vi.resetModules();
  storage = new Map();
  vi.stubGlobal('window', { localStorage: { getItem: (key: string) => storage.get(key) ?? null, setItem: (key: string, value: string) => storage.set(key, value), removeItem: (key: string) => storage.delete(key) } });
});
afterEach(() => vi.unstubAllGlobals());
describe('per-share guest name store', () => {
  it('keeps anonymous display metadata separate from an explicit name', async () => {
    const store = await import('./shareName');
    expect(store.ensureAuthorName('share-one')).toBe('');
    expect(store.readCommentParticipant('shared', 'share-one')).toMatchObject({ ready: false, loading: true, name: '' });
    expect(store.readShareName('share-one')).toBe('');
    expect(store.shareNamePayload('share-one')).toEqual({});
    store.writeShareName('share-one', 'Alex');
    expect(store.shareNamePayload('share-one')).toEqual({ author_name: 'Alex' });
    expect(store.readShareName('share-two')).toBe('');
  });
  it('waits for one authoritative identity request and deduplicates the parent refresh', async () => {
    let complete!: (response: Response) => void;
    const request = vi.fn(() => new Promise<Response>((resolve) => { complete = resolve; }));
    vi.stubGlobal('fetch', request);
    const store = await import('./shareName');
    const first = store.refreshCommentParticipant('shared', 'one');
    const second = store.refreshCommentParticipant('shared', 'one');
    expect(first).toBe(second);
    expect(store.readCommentParticipant('shared', 'one')).toMatchObject({ ready: false, name: '' });
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
    complete(new Response(JSON.stringify({ name: 'Purple Hedgehog', kind: 'guest', verified: false, avatar_url: null, name_chosen: false }), { status: 200 }));
    await first;
    expect(store.readCommentParticipant('shared', 'one')).toMatchObject({ ready: true, loading: false, name: 'Purple Hedgehog' });
    expect(store.ensureAuthorName('one')).toBe('Purple Hedgehog');
    expect(store.claimCommentIdentityRefresh('shared', 'one')).toBe(true);
    expect(store.claimCommentIdentityRefresh('shared', 'one')).toBe(false);
  });
  it('never substitutes a guest identity after failure and can retry without losing the typed name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    const store = await import('./shareName');
    store.writeShareName('one', 'Chosen Name');
    await store.refreshCommentParticipant('shared', 'one');
    expect(store.readCommentParticipant('shared', 'one')).toMatchObject({ ready: false, loading: false, name: '', verified: false });
    expect(store.readCommentParticipant('shared', 'one').error).toContain('Retry');
    expect(store.readShareName('one')).toBe('Chosen Name');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ name: 'Blue Otter', kind: 'guest', verified: false, avatar_url: null, name_chosen: false }), { status: 200 })));
    await store.refreshCommentParticipant('shared', 'one');
    expect(store.readCommentParticipant('shared', 'one')).toMatchObject({ ready: true, name: 'Blue Otter', error: null });
  });
  it('migrates a legacy typed name but does not treat Visitor ids as chosen names', async () => {
    const store = await import('./shareName');
    storage.set('e3-share-author', 'Legacy name');
    expect(store.readShareName('one')).toBe('Legacy name');
    expect(storage.has('e3-share-author')).toBe(false);
    store.writeShareName('two', 'Visitor 4f2a');
    expect(store.shareNamePayload('two')).toEqual({});
  });
  it('keeps changes shared in memory when localStorage is unavailable', async () => {
    vi.stubGlobal('window', { get localStorage() { throw new Error('blocked'); } });
    const store = await import('./shareName');
    store.writeShareName('one', 'Alex');
    expect(store.readShareName('one')).toBe('Alex');
    store.writeShareName('one', 'Renamed');
    expect(store.shareNamePayload('one')).toEqual({ author_name: 'Renamed' });
  });
});

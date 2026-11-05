import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyLibraryDoc, type LibraryDoc } from './types';
import { addColorStyle } from './styles';
import { mergeLibrary, useLibraryDoc } from './store';
import { LibrarySync } from '../../sync/libraryRuntime';

const comp = (id: string, rev = 1) => ({ id, name: id, rev, width: 10, height: 10, nodes: [] });
const withComp = (l: LibraryDoc, id: string, rev = 1): LibraryDoc => ({ ...l, components: { ...l.components, [id]: comp(id, rev) } });

describe('mergeLibrary (three-way, per id)', () => {
  it('keeps both sides additions', () => {
    const base = emptyLibraryDoc();
    const m = mergeLibrary(base, withComp(base, 'mine'), withComp(base, 'theirs'));
    expect(Object.keys(m.components).sort()).toEqual(['mine', 'theirs']);
  });
  it('a change on one side wins over an untouched other side; a real conflict prefers my change', () => {
    const base = withComp(emptyLibraryDoc(), 'c', 1);
    expect(mergeLibrary(base, withComp(base, 'c', 2), base).components.c.rev).toBe(2);
    expect(mergeLibrary(base, base, withComp(base, 'c', 5)).components.c.rev).toBe(5);
    expect(mergeLibrary(base, withComp(base, 'c', 2), withComp(base, 'c', 5)).components.c.rev).toBe(5); // the shared revision never goes back
  });
  it('a deletion on my side removes it unless they changed it meanwhile', () => {
    const base = withComp(emptyLibraryDoc(), 'c');
    expect(mergeLibrary(base, emptyLibraryDoc(), base).components.c).toBeUndefined();
    expect(mergeLibrary(base, emptyLibraryDoc(), withComp(base, 'c', 3)).components.c.rev).toBe(3);
  });
  it('styles and tokens merge the same way', () => {
    const base = emptyLibraryDoc();
    const mine = addColorStyle(base, { id: 'a', name: 'A', value: '#111111' });
    const theirs = addColorStyle(base, { id: 'b', name: 'B', value: '#222222' });
    expect(Object.keys(mergeLibrary(base, mine, theirs).styles.colors).sort()).toEqual(['a', 'b']);
  });
});

describe('local store', () => {
  beforeEach(() => { localStorage.clear(); useLibraryDoc.getState().close(); });
  it('is empty until components exist, persists per project and reloads', () => {
    const s = useLibraryDoc.getState();
    s.open('p1');
    expect(Object.keys(useLibraryDoc.getState().doc.components)).toHaveLength(0);
    s.update((d) => withComp(d, 'c1'));
    s.close();
    s.open('p1');
    expect(useLibraryDoc.getState().doc.components.c1).toBeTruthy();
    s.open('p2');
    expect(useLibraryDoc.getState().doc.components.c1).toBeUndefined();
  });
});

describe('server sync with local fallback', () => {
  beforeEach(() => { localStorage.clear(); useLibraryDoc.getState().close(); useLibraryDoc.getState().open('p1'); });
  const api = (server: { rev: number; doc: LibraryDoc }, conflict: { status: number; code?: string } = { status: 409 }) => ({
    getLibrary: vi.fn(async () => ({ rev: server.rev, doc: server.doc })),
    putLibrary: vi.fn(async (_id: string, baseRev: number, doc: LibraryDoc) => {
      if (baseRev !== server.rev) { const e = Object.assign(new Error('conflict'), conflict); throw e; }
      server.rev++; server.doc = doc; return { rev: server.rev, doc };
    }),
  });
  it('pull adopts the server library when I have no local changes', async () => {
    const server = { rev: 3, doc: withComp(emptyLibraryDoc(), 'srv') };
    const sync = new LibrarySync(api(server), 'p1');
    await sync.pull();
    expect(useLibraryDoc.getState().doc.components.srv).toBeTruthy();
    expect(useLibraryDoc.getState().rev).toBe(3);
  });
  it('push sends local changes with the base revision and records the new one', async () => {
    const server = { rev: 0, doc: emptyLibraryDoc() };
    const a = api(server);
    const sync = new LibrarySync(a, 'p1');
    await sync.pull();
    useLibraryDoc.getState().update((d) => withComp(d, 'mine'));
    await sync.push();
    expect(a.putLibrary).toHaveBeenCalledWith('p1', 0, expect.anything());
    expect(server.doc.components.mine).toBeTruthy();
    expect(useLibraryDoc.getState().rev).toBe(1);
    expect(useLibraryDoc.getState().dirty).toBe(false);
  });
  it.each([
    ['409 (Node server)', { status: 409 }],
    ['412 LIBRARY_CONFLICT (Go API)', { status: 412, code: 'LIBRARY_CONFLICT' }],
  ])('a %s pulls, merges my changes on top and retries', async (_n, conflict) => {
    const server = { rev: 0, doc: emptyLibraryDoc() };
    const a = api(server, conflict);
    const sync = new LibrarySync(a, 'p1');
    await sync.pull();
    useLibraryDoc.getState().update((d) => withComp(d, 'mine'));
    server.rev = 1; server.doc = withComp(emptyLibraryDoc(), 'theirs');
    await sync.push();
    expect(Object.keys(server.doc.components).sort()).toEqual(['mine', 'theirs']);
    expect(Object.keys(useLibraryDoc.getState().doc.components).sort()).toEqual(['mine', 'theirs']);
  });
  it('offline: the push fails quietly, edits stay local and dirty', async () => {
    const a = { getLibrary: vi.fn(async () => { throw new Error('offline'); }), putLibrary: vi.fn(async () => { throw new Error('offline'); }) };
    const sync = new LibrarySync(a, 'p1');
    useLibraryDoc.getState().update((d) => withComp(d, 'mine'));
    await expect(sync.push()).resolves.toBeUndefined();
    expect(useLibraryDoc.getState().dirty).toBe(true);
    expect(useLibraryDoc.getState().doc.components.mine).toBeTruthy();
  });
});

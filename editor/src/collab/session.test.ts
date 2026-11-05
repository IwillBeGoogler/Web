import * as Y from 'yjs';
import { createStore } from 'zustand/vanilla';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DiagramNode } from '../types';
import type { BindingStore, CollabSlice } from './binding';
import { FakeServer } from './fakeServer';
import { CollabSession } from './session';
import { readProject, writeProject } from './yproject';

const icon = (id: string, x = 0): DiagramNode => ({ id, type: 'icon', position: { x, y: 0 }, data: { label: id } }) as DiagramNode;
const slice = (over: Partial<CollabSlice> = {}): CollabSlice => ({
  nodes: [], edges: [], past: [], future: [], projectId: 'f1', projectName: 'File', createdAt: 1,
  pages: [{ id: 'p1', name: 'Page 1' }], activePageId: 'p1', stash: {}, projectSettings: {}, viewports: {}, pageFlow: {}, assets: {}, ...over,
});
const mkStore = (over: Partial<CollabSlice> = {}) => createStore<CollabSlice>(() => slice(over)) as unknown as BindingStore;
const flush = async () => {
  for (let i = 0; i < 6; i++) await Promise.resolve();
  await vi.advanceTimersByTimeAsync(0);
};
let server: FakeServer;
beforeEach(() => {
  vi.useFakeTimers();
  server = new FakeServer();
});
afterEach(() => vi.useRealTimers());

function session(over: Partial<ConstructorParameters<typeof CollabSession>[0]> = {}, store = mkStore()) {
  const setDriver = vi.fn();
  const s = new CollabSession({
    fileId: 'f1',
    role: 'editor',
    user: { id: 'u_me', name: 'Me' },
    link: server.link(),
    store,
    persistence: null,
    setHistoryDriver: setDriver,
    seedTimeoutMs: 1000,
    ...over,
  });
  return { s, store, setDriver };
}
const seedServer = (nodes: DiagramNode[], name = 'Server file') => writeProject(server.doc, { version: 2, id: 'f1', name, createdAt: 1, updatedAt: 1, activePageId: 'p1', pages: [{ id: 'p1', name: 'Page 1', nodes: nodes as never, edges: [] }] }, 'seed');
const ids = (st: BindingStore) => st.getState().nodes.map((n) => n.id);

describe('CollabSession: opening a file', () => {
  it('the server is the source of truth: its content replaces the cached editor content after the first sync', async () => {
    seedServer([icon('s1'), icon('s2')]);
    const { s, store } = session({}, mkStore({ nodes: [icon('stale')], projectName: 'Cached' }));
    await s.start();
    await flush();
    expect(s.synced).toBe(true);
    expect(ids(store)).toEqual(['s1', 's2']);
    expect(store.getState().projectName).toBe('Server file');
    s.stop();
  });

  it('an empty server doc is seeded from the editor content (only the very first open of a file)', async () => {
    const { s, store } = session({}, mkStore({ nodes: [icon('mine')] }));
    await s.start();
    await flush();
    expect(readProject(server.doc, { id: 'f1' }).pages[0].nodes.map((n) => n.id)).toEqual(['mine']);
    expect(ids(store)).toEqual(['mine']);
    s.stop();
  });

  it('IndexedDB content is applied right away (offline start), then merged with the server', async () => {
    const idb = new Y.Doc();
    writeProject(idb, { version: 2, id: 'f1', name: 'From IDB', createdAt: 1, updatedAt: 1, activePageId: 'p1', pages: [{ id: 'p1', name: 'Page 1', nodes: [icon('idb1')] as never, edges: [] }] }, 'x');
    server.accepting = false;
    const { s, store } = session({ persistence: (doc) => { Y.applyUpdate(doc, Y.encodeStateAsUpdate(idb), 'idb'); return { whenSynced: Promise.resolve(), destroy: () => undefined }; } });
    await s.start();
    await flush();
    expect(ids(store)).toEqual(['idb1']);
    expect(s.status).toBe('offline');
    // offline edit, then the server comes back with its own changes: both survive
    store.setState((st) => ({ nodes: [...st.nodes, icon('offline-edit')], past: [...st.past, 1] }));
    seedServer([icon('idb1'), icon('server-new')]);
    server.accepting = true;
    await vi.advanceTimersByTimeAsync(1000);
    await flush();
    expect(s.status).toBe('connected');
    expect(ids(store).sort()).toEqual(['idb1', 'offline-edit', 'server-new']);
    s.stop();
  });

  it('server unreachable and nothing cached: after the seed timeout the editor content is seeded locally and edits keep working', async () => {
    server.accepting = false;
    const { s, store } = session({}, mkStore({ nodes: [icon('local')] }));
    await s.start();
    await vi.advanceTimersByTimeAsync(1200);
    await flush();
    expect(s.status).toBe('offline');
    store.setState((st) => ({ nodes: [...st.nodes, icon('local2')], past: [...st.past, 1] }));
    server.accepting = true;
    await vi.advanceTimersByTimeAsync(2000);
    await flush();
    expect(readProject(server.doc, { id: 'f1' }).pages[0].nodes.map((n) => n.id).sort()).toEqual(['local', 'local2']);
    s.stop();
  });

  it('viewers and commenters apply remote changes but never write; editors do', async () => {
    seedServer([icon('a')]);
    const ro = session({ role: 'commenter' }, mkStore());
    await ro.s.start();
    await flush();
    expect(ro.s.readOnly).toBe(true);
    ro.store.setState((st) => ({ nodes: [...st.nodes, icon('sneaky')], past: [...st.past, 1] }));
    await flush();
    expect(readProject(server.doc, { id: 'f1' }).pages[0].nodes.map((n) => n.id)).toEqual(['a']);
    writeProject(server.doc, { ...readProject(server.doc, { id: 'f1' }), pages: [{ ...readProject(server.doc, { id: 'f1' }).pages[0], nodes: [icon('b') as never, icon('a') as never] }] }, 'srv');
    await flush();
    expect(ids(ro.store).sort()).toEqual(['a', 'b']);
    ro.s.stop();
  });

  it('collaborative files use the per-user undo manager: the history driver is installed and removed', async () => {
    seedServer([icon('a')]);
    const { s, setDriver } = session();
    await s.start();
    await flush();
    expect(setDriver).toHaveBeenCalledWith(expect.objectContaining({ undo: expect.any(Function), redo: expect.any(Function), checkpoint: expect.any(Function) }));
    s.stop();
    expect(setDriver).toHaveBeenLastCalledWith(null);
  });
});

describe('CollabSession: presence', () => {
  it('publishes my name, colour, cursor, selection and viewport; remote people show up as collaborators', async () => {
    seedServer([icon('a')]);
    const a = session({ user: { id: 'u_a', name: 'Ann' } });
    const b = session({ user: { id: 'u_b', name: 'Bo' } });
    await a.s.start();
    await b.s.start();
    await flush();
    a.s.setCursor({ x: 10, y: 20 });
    a.s.setViewport({ x: 0, y: 0, w: 800, h: 600 });
    a.store.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: true })) }));
    await vi.advanceTimersByTimeAsync(200);
    await flush();
    const list = b.s.collaborators();
    expect(list).toHaveLength(1);
    expect(list[0].user).toMatchObject({ id: 'u_a', name: 'Ann' });
    expect(list[0].user.color).toMatch(/^#/);
    expect(list[0].state.cursor).toEqual({ x: 10, y: 20 });
    expect(list[0].state.selection?.nodes).toEqual(['a']);
    expect(list[0].state.viewport).toEqual({ x: 0, y: 0, w: 800, h: 600 });
    a.s.setCursor(null);
    await vi.advanceTimersByTimeAsync(200);
    expect(b.s.collaborators()[0].state.cursor).toBeNull();
    a.s.stop();
    await flush();
    expect(b.s.collaborators()).toEqual([]);
    b.s.stop();
  });

  it('goes idle after a minute without activity and back to active on activity', async () => {
    seedServer([icon('a')]);
    const a = session({ user: { id: 'u_a', name: 'Ann' } });
    const b = session({ user: { id: 'u_b', name: 'Bo' } });
    await a.s.start();
    await b.s.start();
    await flush();
    await vi.advanceTimersByTimeAsync(70_000);
    expect(b.s.collaborators()[0].status).toBe('idle');
    a.s.touch();
    await vi.advanceTimersByTimeAsync(6_000);
    expect(b.s.collaborators()[0].status).toBe('active');
    a.s.stop();
    b.s.stop();
  });
});

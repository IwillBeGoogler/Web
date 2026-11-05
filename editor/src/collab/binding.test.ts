import * as Y from 'yjs';
import { createStore } from 'zustand/vanilla';
import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../types';
import { StoreBinding, type BindingStore, type CollabSlice } from './binding';
import { readProject } from './yproject';

const icon = (id: string, x = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y: 0 }, data: { label: id }, ...extra }) as DiagramNode;
const edge = (id: string, source: string, target: string): DiagramEdge => ({ id, source, target }) as DiagramEdge;

function slice(over: Partial<CollabSlice> = {}): CollabSlice {
  return {
    nodes: [], edges: [], past: [], future: [], projectId: 'f1', projectName: 'File', createdAt: 1,
    pages: [{ id: 'p1', name: 'Page 1' }], activePageId: 'p1', stash: {}, projectSettings: {}, viewports: {}, pageFlow: {}, assets: {},
    ...over,
  };
}
interface Side {
  doc: Y.Doc;
  store: BindingStore;
  b: StoreBinding;
  /** a local edit that records an undo step (like the real store's pushPast) */
  edit: (fn: (s: CollabSlice) => Partial<CollabSlice>) => void;
}
function side(over: Partial<CollabSlice> = {}, doc = new Y.Doc(), readOnly = false): Side {
  const store = createStore<CollabSlice>(() => slice(over)) as unknown as BindingStore;
  const b = new StoreBinding({ doc, store, fileId: 'f1', readOnly });
  const edit = (fn: (s: CollabSlice) => Partial<CollabSlice>) =>
    store.setState((s) => ({ ...fn(s), past: [...s.past, { nodes: s.nodes, edges: s.edges }], future: [] }));
  return { doc, store, b, edit };
}
/** keep two docs in sync (like a provider); returns a switch to go offline / online */
function link(a: Y.Doc, b: Y.Doc) {
  let online = true;
  const relay = (from: Y.Doc, to: Y.Doc) => from.on('update', (u: Uint8Array, origin: unknown) => online && origin !== 'relay' && Y.applyUpdate(to, u, 'relay'));
  relay(a, b);
  relay(b, a);
  return {
    offline: () => void (online = false),
    online: () => {
      online = true;
      Y.applyUpdate(b, Y.encodeStateAsUpdate(a, Y.encodeStateVector(b)), 'relay');
      Y.applyUpdate(a, Y.encodeStateAsUpdate(b, Y.encodeStateVector(a)), 'relay');
    },
  };
}
const ids = (s: Side) => s.store.getState().nodes.map((n) => n.id);

describe('StoreBinding: store -> Y', () => {
  it('a local op becomes a Y transaction', () => {
    const a = side();
    a.b.start();
    a.edit((s) => ({ nodes: [...s.nodes, icon('n1', 10)] }));
    const p = readProject(a.doc, { id: 'f1' });
    expect(p.pages[0].nodes.map((n) => n.id)).toEqual(['n1']);
    a.edit((s) => ({ nodes: s.nodes.map((n) => ({ ...n, position: { x: 99, y: 0 } })) }));
    expect(readProject(a.doc, { id: 'f1' }).pages[0].nodes[0].position).toEqual({ x: 99, y: 0 });
    a.edit((s) => ({ nodes: [], edges: s.edges }));
    expect(readProject(a.doc, { id: 'f1' }).pages[0].nodes).toEqual([]);
  });

  it('selection and dragging flags never reach Y', () => {
    const a = side({ nodes: [icon('n1')] });
    a.b.start();
    a.b.seed();
    a.store.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, selected: true, dragging: true })) }));
    const n = readProject(a.doc, { id: 'f1' }).pages[0].nodes[0];
    expect(n).not.toHaveProperty('selected');
    expect(n).not.toHaveProperty('dragging');
  });

  it('writes the file name, page settings and edges too', () => {
    const a = side();
    a.b.start();
    a.edit((s) => ({ projectName: 'Renamed', nodes: [icon('a'), icon('b')], edges: [edge('e1', 'a', 'b')], projectSettings: s.projectSettings }));
    const p = readProject(a.doc, { id: 'f1' });
    expect(p.name).toBe('Renamed');
    expect(p.pages[0].edges.map((e) => e.id)).toEqual(['e1']);
  });

  it('a read-only binding never writes', () => {
    const a = side({}, new Y.Doc(), true);
    a.b.start();
    a.edit(() => ({ nodes: [icon('x')] }));
    expect(readProject(a.doc, { id: 'f1' }).pages[0].nodes).toEqual([]);
  });
});

describe('StoreBinding: Y -> store', () => {
  it('a remote update patches the store, keeps local selection, and does not echo', () => {
    const a = side({ nodes: [icon('n1'), icon('n2')] });
    a.b.start();
    a.b.seed();
    a.store.setState((s) => ({ nodes: s.nodes.map((n) => (n.id === 'n1' ? { ...n, selected: true } : n)) }));
    const other = new Y.Doc();
    Y.applyUpdate(other, Y.encodeStateAsUpdate(a.doc));
    const updates: unknown[] = [];
    a.doc.on('update', (_u: Uint8Array, origin: unknown) => updates.push(origin));
    const n2Before = a.store.getState().nodes[1];
    // somebody else moves n1 and adds n3
    const p = readProject(other, { id: 'f1' });
    other.transact(() => undefined);
    const remoteStore = createStore<CollabSlice>(() => slice({ nodes: p.pages[0].nodes as unknown as DiagramNode[] })) as unknown as BindingStore;
    const remote = new StoreBinding({ doc: other, store: remoteStore, fileId: 'f1' });
    remote.start();
    remoteStore.setState((s) => ({ nodes: [...s.nodes.map((n) => (n.id === 'n1' ? { ...n, position: { x: 500, y: 5 } } : n)), icon('n3')] }));
    Y.applyUpdate(a.doc, Y.encodeStateAsUpdate(other, Y.encodeStateVector(a.doc)), 'relay');
    const nodes = a.store.getState().nodes;
    expect(nodes.map((n) => n.id)).toEqual(['n1', 'n2', 'n3']);
    expect(nodes[0].position).toEqual({ x: 500, y: 5 });
    expect(nodes[0].selected).toBe(true); // local selection survives a remote edit
    expect(nodes[1]).toBe(n2Before); // untouched nodes keep their identity (no re-render)
    expect(updates.filter((o) => o !== 'relay')).toEqual([]); // nothing was written back: no echo
    expect(a.b.undoDepth()).toBe(0); // remote changes are not undoable by me
  });

  it('start() with a filled doc loads it into the store', () => {
    const src = side({ nodes: [icon('a'), icon('b')], edges: [edge('e', 'a', 'b')], projectName: 'Shared' });
    src.b.start();
    src.b.seed();
    const b = side({ nodes: [], projectName: 'Stale' }, new Y.Doc());
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(src.doc));
    b.b.start();
    expect(ids(b)).toEqual(['a', 'b']);
    expect(b.store.getState().projectName).toBe('Shared');
    expect(b.store.getState().edges.map((e) => e.id)).toEqual(['e']);
  });
});

describe('StoreBinding: two peers converge', () => {
  it('concurrent edits (different nodes, same node different fields, adds, deletes) merge identically', () => {
    const a = side({ nodes: [icon('n1'), icon('n2'), icon('n3')] });
    a.b.start();
    a.b.seed();
    const b = side({}, new Y.Doc());
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    b.b.start();
    const net = link(a.doc, b.doc);
    net.offline();
    a.edit((s) => ({ nodes: s.nodes.map((n) => (n.id === 'n1' ? { ...n, position: { x: 7, y: 7 } } : n)).concat(icon('fromA')) }));
    b.edit((s) => ({ nodes: s.nodes.filter((n) => n.id !== 'n3').map((n) => (n.id === 'n1' ? { ...n, data: { ...n.data, label: 'B label' } } : n)).concat(icon('fromB')) }));
    net.online();
    const sa = a.store.getState().nodes;
    const sb = b.store.getState().nodes;
    expect(sa.map((n) => n.id).sort()).toEqual(sb.map((n) => n.id).sort());
    expect(sa.map((n) => n.id).sort()).toEqual(['fromA', 'fromB', 'n1', 'n2']);
    const n1a = sa.find((n) => n.id === 'n1')!;
    expect(n1a.position).toEqual({ x: 7, y: 7 });
    expect(n1a.data.label).toBe('B label');
    expect(sb.find((n) => n.id === 'n1')).toMatchObject({ position: { x: 7, y: 7 }, data: { label: 'B label' } });
    expect(readProject(a.doc, { id: 'f1', updatedAt: 1 })).toEqual(readProject(b.doc, { id: 'f1', updatedAt: 1 }));
  });

  it('offline edits merge on reconnect', () => {
    const a = side({ nodes: [icon('base')] });
    a.b.start();
    a.b.seed();
    const b = side({}, new Y.Doc());
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    b.b.start();
    const net = link(a.doc, b.doc);
    net.offline();
    for (let i = 0; i < 3; i++) a.edit((s) => ({ nodes: [...s.nodes, icon(`a${i}`)] }));
    for (let i = 0; i < 3; i++) b.edit((s) => ({ nodes: [...s.nodes, icon(`b${i}`)] }));
    expect(ids(a)).toHaveLength(4);
    net.online();
    expect(ids(a).sort()).toEqual(['a0', 'a1', 'a2', 'b0', 'b1', 'b2', 'base']);
    expect(ids(b).sort()).toEqual(ids(a).sort());
  });
});

describe('StoreBinding: undo / redo per user', () => {
  function pair() {
    const a = side({ nodes: [icon('base')] });
    a.b.start();
    a.b.seed();
    const b = side({}, new Y.Doc());
    Y.applyUpdate(b.doc, Y.encodeStateAsUpdate(a.doc));
    b.b.start();
    link(a.doc, b.doc);
    a.b.stopCapturing();
    return { a, b };
  }
  it('undo reverts only MY changes, never the other user\'s; redo brings mine back', () => {
    const { a, b } = pair();
    a.edit((s) => ({ nodes: [...s.nodes, icon('mine')] }));
    b.edit((s) => ({ nodes: [...s.nodes, icon('theirs')] }));
    expect(ids(a).sort()).toEqual(['base', 'mine', 'theirs']);
    a.b.undo();
    expect(ids(a).sort()).toEqual(['base', 'theirs']);
    expect(ids(b).sort()).toEqual(['base', 'theirs']);
    b.b.undo(); // B undoes B's change only
    expect(ids(a)).toEqual(['base']);
    expect(ids(b)).toEqual(['base']);
    a.b.redo();
    expect(ids(b).sort()).toEqual(['base', 'mine']);
  });

  it('each recorded step is one undo; a drag (many position updates after one checkpoint) is one undo', () => {
    const { a } = pair();
    a.edit((s) => ({ nodes: s.nodes.map((n) => ({ ...n, position: { x: 10, y: 0 } })) })); // checkpoint + first move
    for (let x = 11; x < 30; x++) a.store.setState((s) => ({ nodes: s.nodes.map((n) => ({ ...n, position: { x, y: 0 } })) })); // live drag, no history push
    a.edit((s) => ({ nodes: [...s.nodes, icon('after')] }));
    expect(a.b.undoDepth()).toBe(2);
    a.b.undo();
    expect(ids(a)).toEqual(['base']);
    expect(a.store.getState().nodes[0].position).toEqual({ x: 29, y: 0 });
    a.b.undo();
    expect(a.store.getState().nodes[0].position).toEqual({ x: 0, y: 0 });
  });

  it('the store history arrays mirror the undo / redo stacks (the toolbar buttons keep working)', () => {
    const { a } = pair();
    expect(a.store.getState().past).toHaveLength(0);
    a.edit((s) => ({ nodes: [...s.nodes, icon('one')] }));
    expect(a.store.getState().past).toHaveLength(1);
    a.b.undo();
    expect(a.store.getState().past).toHaveLength(0);
    expect(a.store.getState().future).toHaveLength(1);
    a.b.redo();
    expect(a.store.getState().past).toHaveLength(1);
    expect(a.store.getState().future).toHaveLength(0);
  });

  it('stop() detaches: later edits are not written', () => {
    const { a } = pair();
    a.b.stop();
    a.edit((s) => ({ nodes: [...s.nodes, icon('late')] }));
    expect(readProject(a.doc, { id: 'f1' }).pages[0].nodes.map((n) => n.id)).toEqual(['base']);
  });
});

describe('StoreBinding with the real diagram store', () => {
  it('undo / redo / snapshot of the store go to the per-user UndoManager while a history driver is set', async () => {
    const { useDiagramStore, setHistoryDriver } = await import('../store/diagramStore');
    const st = useDiagramStore;
    st.getState().reset();
    const doc = new Y.Doc();
    const b = new StoreBinding({ doc, store: st as unknown as BindingStore, fileId: st.getState().projectId });
    b.start();
    setHistoryDriver({ undo: () => b.undo(), redo: () => b.redo(), checkpoint: () => b.stopCapturing() });
    try {
      st.getState().addNode(icon('x1'));
      st.getState().addNode(icon('x2'));
      expect(st.getState().nodes.map((n) => n.id)).toEqual(['x1', 'x2']);
      expect(st.getState().past.length).toBe(2);
      // somebody else's node arrives
      const other = new Y.Doc();
      Y.applyUpdate(other, Y.encodeStateAsUpdate(doc));
      const ob = createStore<CollabSlice>(() => slice({ projectId: st.getState().projectId, nodes: st.getState().nodes.map((n) => ({ ...n })), pages: st.getState().pages, activePageId: st.getState().activePageId })) as unknown as BindingStore;
      const obb = new StoreBinding({ doc: other, store: ob, fileId: st.getState().projectId });
      obb.start();
      ob.setState((s) => ({ nodes: [...s.nodes, icon('theirs')], past: [...s.past, 1] }));
      Y.applyUpdate(doc, Y.encodeStateAsUpdate(other, Y.encodeStateVector(doc)), 'relay');
      expect(st.getState().nodes.map((n) => n.id)).toEqual(['x1', 'x2', 'theirs']);
      st.getState().undo();
      expect(st.getState().nodes.map((n) => n.id)).toEqual(['x1', 'theirs']);
      st.getState().undo();
      expect(st.getState().nodes.map((n) => n.id)).toEqual(['theirs']);
      expect(st.getState().past).toHaveLength(0); // nothing left of mine: the toolbar's undo is disabled
      st.getState().redo();
      expect(st.getState().nodes.map((n) => n.id)).toEqual(['x1', 'theirs']);
    } finally {
      setHistoryDriver(null);
      b.stop();
      st.getState().reset();
    }
  });
});

describe('private stickies stay out of the shared doc', () => {
  const priv = (id: string, extra: Record<string, unknown> = {}): DiagramNode => ({ id, type: 'sticky', position: { x: 0, y: 0 }, data: { label: `secret ${id}`, private: true, authorId: 'me', ...extra } }) as unknown as DiagramNode;
  const docText = (d: Y.Doc) => JSON.stringify(readProject(d, { id: 'f1' })) + Buffer.from(Y.encodeStateAsUpdate(d)).toString('latin1');

  it('never written: not on a local edit, not by seed(), and the edges attached to them stay out too', () => {
    const a = side({ nodes: [icon('n1'), priv('s1')], edges: [edge('e1', 'n1', 's1')] });
    a.b.start();
    a.b.seed();
    expect(docText(a.doc)).not.toContain('secret');
    expect(readProject(a.doc, { id: 'f1' }).pages[0].edges).toEqual([]);
    a.edit((s) => ({ nodes: [...s.nodes, priv('s2'), icon('n2')] }));
    expect(readProject(a.doc, { id: 'f1' }).pages[0].nodes.map((n) => n.id)).toEqual(['n1', 'n2']);
    expect(docText(a.doc)).not.toContain('secret');
    expect(ids(a)).toEqual(['n1', 's1', 's2', 'n2']); // still in MY store
  });
  it('revealing one (private flag off) shares it; making a shared one private removes it from the doc', () => {
    const a = side({ nodes: [icon('n1'), priv('s1')] });
    a.b.start();
    a.b.seed();
    a.edit((s) => ({ nodes: s.nodes.map((n) => (n.id === 's1' ? { ...n, data: { ...n.data, private: false } } : n)) }));
    expect(readProject(a.doc, { id: 'f1' }).pages[0].nodes.map((n) => n.id)).toEqual(['n1', 's1']);
    a.edit((s) => ({ nodes: s.nodes.map((n) => (n.id === 'n1' ? { ...n, type: 'sticky', data: { ...n.data, private: true } } : n)) }));
    expect(readProject(a.doc, { id: 'f1' }).pages[0].nodes.map((n) => n.id)).toEqual(['s1']);
  });
  it('a remote change keeps my private stickies in my store and the other side never gets them', () => {
    const doc = new Y.Doc();
    const a = side({ nodes: [icon('n1')] }, doc);
    const other = new Y.Doc();
    link(doc, other);
    const b = side({}, other);
    a.b.start(); a.b.seed(); b.b.start();
    a.edit((s) => ({ nodes: [...s.nodes, priv('mine')] }));
    b.edit((s) => ({ nodes: [...s.nodes, icon('theirs', 50)] }));
    expect(ids(a)).toEqual(['n1', 'theirs', 'mine']);
    expect(ids(b)).toEqual(['n1', 'theirs']);
    expect(docText(other)).not.toContain('secret');
  });
});

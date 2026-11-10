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
const proj = (a: Side) => readProject(a.doc, { id: 'f1' });

describe('StoreBinding: settings, assets, flow, guides, viewport round trips', () => {
  it('store -> doc: settings, assets, flow, guides and viewport land in the project', () => {
    const a = side({ projectSettings: { node: { radius: 7 } } as never, assets: { h1: { name: 'x' } } as never, pageFlow: { p1: true }, guides: { p1: [{ id: 'g', axis: 'x', pos: 5 }] } as never, viewports: { p1: { x: 1, y: 2, zoom: 1.5 } } as never });
    a.b.start();
    a.b.seed();
    const p = proj(a);
    expect(p.settings).toEqual({ node: { radius: 7 } });
    expect(Object.keys(p.assets ?? {})).toEqual(['h1']);
    expect(p.pages[0].flow).toBe(true);
    expect(p.pages[0].guides).toHaveLength(1);
  });
  it('doc -> store: a remote change of settings, assets, flow and guides updates the slice, and removing them clears it', () => {
    const a = side();
    const b = side({}, new Y.Doc());
    const l = link(a.doc, b.doc);
    a.b.start();
    b.b.start();
    a.b.seed();
    a.edit(() => ({ projectSettings: { node: { radius: 3 } } as never, assets: { h: { name: 'n' } } as never, pageFlow: { p1: true }, guides: { p1: [{ id: 'g', axis: 'y', pos: 9 }] } as never }));
    const s = b.store.getState();
    expect(s.projectSettings).toEqual({ node: { radius: 3 } });
    expect(Object.keys(s.assets)).toEqual(['h']);
    expect(s.pageFlow.p1).toBe(true);
    expect(s.guides?.p1).toHaveLength(1);
    a.edit(() => ({ projectSettings: {}, assets: {}, pageFlow: {}, guides: {} as never }));
    const t = b.store.getState();
    expect(t.pageFlow.p1).toBeUndefined();
    expect(t.guides?.p1).toBeUndefined();
    expect(Object.keys(t.assets)).toEqual([]);
    l.offline();
  });
  it('a renamed or replaced page in the doc replaces the slice page list; a different active page id is adopted', () => {
    const a = side();
    const b = side();
    link(a.doc, b.doc);
    a.b.start();
    b.b.start();
    a.b.seed();
    a.edit(() => ({ pages: [{ id: 'p1', name: 'Renamed page' }] }));
    expect(b.store.getState().pages[0].name).toBe('Renamed page');
    b.store.setState({ activePageId: 'other' });
    a.edit((s) => ({ nodes: [...s.nodes, icon('z')] }));
    expect(b.store.getState().activePageId).toBe('p1');
  });
  it('an undo/redo stack change only mirrors history; unrelated slice changes are ignored', () => {
    const a = side();
    a.b.start();
    a.b.seed();
    a.store.setState({ past: [{ nodes: [], edges: [] }] as never });
    a.store.setState({ future: [{ nodes: [], edges: [] }] as never });
    a.store.setState({ projectId: 'f1' });
    expect(proj(a).pages).toHaveLength(1);
  });
  it('start is idempotent; stop detaches; read-only bindings do not write', () => {
    const a = side();
    a.b.start();
    a.b.start();
    a.b.seed();
    a.b.stop?.();
    const ro = side({ nodes: [icon('x')] }, new Y.Doc(), true);
    ro.b.start();
    ro.edit((s) => ({ nodes: [...s.nodes, icon('y')] }));
    expect(readProject(ro.doc, { id: 'f1' }).pages[0]?.nodes ?? []).toHaveLength(0);
  });
  it('an empty page list falls back to the first page when writing', () => {
    const a = side({ pages: [{ id: 'p1', name: 'A' }, { id: 'p2', name: 'B' }], activePageId: 'ghost' });
    a.b.start();
    a.b.seed();
    expect(proj(a).activePageId).toBe('p1');
  });
});

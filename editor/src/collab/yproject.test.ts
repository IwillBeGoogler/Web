import * as Y from 'yjs';
import { describe, expect, it } from 'vitest';
import { addMissingPages, deleteEntities, isDocEmpty, readProject, writeProject, type YProject } from './yproject';

const node = (id: string, x = 0, extra: Record<string, unknown> = {}) => ({ id, type: 'icon', position: { x, y: 0 }, data: { label: id, tags: ['a'] }, ...extra });
const proj = (over: Partial<YProject> = {}): YProject => ({
  version: 2,
  id: 'f1',
  name: 'File',
  createdAt: 1,
  updatedAt: 2,
  activePageId: 'p1',
  pages: [{ id: 'p1', name: 'Page 1', nodes: [node('a'), node('b', 100)], edges: [{ id: 'e1', source: 'a', target: 'b', data: { kind: 'sync' } }] }],
  ...over,
});
const sync = (a: Y.Doc, b: Y.Doc) => {
  Y.applyUpdate(b, Y.encodeStateAsUpdate(a));
  Y.applyUpdate(a, Y.encodeStateAsUpdate(b));
};

describe('yproject', () => {
  it('round-trips a project through a Y.Doc', () => {
    const d = new Y.Doc();
    expect(isDocEmpty(d)).toBe(true);
    writeProject(d, proj(), 'x');
    expect(isDocEmpty(d)).toBe(false);
    const out = readProject(d, { id: 'f1' });
    expect(out.name).toBe('File');
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0].nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(out.pages[0].nodes[0].data).toEqual({ label: 'a', tags: ['a'] });
    expect(out.pages[0].edges[0]).toMatchObject({ id: 'e1', source: 'a', target: 'b' });
  });

  it('strips transient UI state', () => {
    const d = new Y.Doc();
    writeProject(d, proj({ pages: [{ id: 'p1', name: 'P', nodes: [node('a', 0, { selected: true, dragging: true, measured: { width: 1, height: 2 } })], edges: [] }] }), 'x');
    const n = readProject(d, { id: 'f1' }).pages[0].nodes[0];
    expect(n).not.toHaveProperty('selected');
    expect(n).not.toHaveProperty('dragging');
    expect(n).not.toHaveProperty('measured');
  });

  it('writes only the diff: one moved node -> one changed Y key', () => {
    const d = new Y.Doc();
    const p = proj();
    writeProject(d, p, 'x');
    const events: Y.YEvent<any>[] = [];
    d.on('afterTransaction', (t: Y.Transaction) => events.push(...[...t.changed.keys()].map((k) => k as any)));
    const moved = { ...p, pages: [{ ...p.pages[0], nodes: [p.pages[0].nodes[0], { ...p.pages[0].nodes[1], position: { x: 500, y: 0 } }] }] };
    writeProject(d, moved, 'x');
    const out = readProject(d, { id: 'f1' });
    expect(out.pages[0].nodes[1].position).toEqual({ x: 500, y: 0 });
    // only the node's own Y.Map changed (not the page, not the sibling)
    expect(events).toHaveLength(1);
  });

  it('merges concurrent edits of different nodes and different fields of one node', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    writeProject(a, proj(), 'seed');
    sync(a, b);
    const pa = readProject(a, { id: 'f1' });
    const pb = readProject(b, { id: 'f1' });
    // A moves node a, B renames node a's label and adds node c
    writeProject(a, { ...pa, pages: [{ ...pa.pages[0], nodes: pa.pages[0].nodes.map((n) => (n.id === 'a' ? { ...n, position: { x: 9, y: 9 } } : n)) }] }, 'l');
    writeProject(b, { ...pb, pages: [{ ...pb.pages[0], nodes: [...pb.pages[0].nodes.map((n) => (n.id === 'a' ? { ...n, data: { ...(n.data as object), label: 'Renamed' } } : n)), node('c', 7)] }] }, 'l');
    sync(a, b);
    const ra = readProject(a, { id: 'f1', updatedAt: 1 });
    const rb = readProject(b, { id: 'f1', updatedAt: 1 });
    expect(ra).toEqual(rb);
    const na = ra.pages[0].nodes.find((n) => n.id === 'a')!;
    expect(na.position).toEqual({ x: 9, y: 9 });
    expect((na.data as { label: string }).label).toBe('Renamed');
    expect(ra.pages[0].nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
  });

  it('keeps node order (z order) and survives a concurrent insert', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    writeProject(a, proj(), 'seed');
    sync(a, b);
    const pa = readProject(a, { id: 'f1' });
    writeProject(a, { ...pa, pages: [{ ...pa.pages[0], nodes: [...pa.pages[0].nodes].reverse() }] }, 'l');
    expect(readProject(a, { id: 'f1' }).pages[0].nodes.map((n) => n.id)).toEqual(['b', 'a']);
    const pb = readProject(b, { id: 'f1' });
    writeProject(b, { ...pb, pages: [{ ...pb.pages[0], nodes: [...pb.pages[0].nodes, node('z')] }] }, 'l');
    sync(a, b);
    const ids = readProject(a, { id: 'f1' }).pages[0].nodes.map((n) => n.id);
    expect(ids).toEqual(readProject(b, { id: 'f1' }).pages[0].nodes.map((n) => n.id));
    expect([...ids].sort()).toEqual(['a', 'b', 'z']);
    expect(new Set(ids).size).toBe(3);
  });

  it('deletes nodes and edges; renames the file and the canvas', () => {
    const d = new Y.Doc();
    writeProject(d, proj(), 'x');
    const p2: YProject = proj({ name: 'Renamed file', pages: [{ id: 'p1', name: 'First', nodes: [node('a')], edges: [] }] });
    writeProject(d, p2, 'x');
    const out = readProject(d, { id: 'f1' });
    expect(out.name).toBe('Renamed file');
    expect(out.pages).toHaveLength(1);
    expect(out.pages[0]).toMatchObject({ id: 'p1', name: 'First' });
    expect(out.pages[0].nodes.map((n) => n.id)).toEqual(['a']);
    expect(out.pages[0].edges).toEqual([]);
  });

  it('only the first page is shared (a file is one canvas)', () => {
    const d = new Y.Doc();
    writeProject(d, proj({ pages: [{ id: 'p1', name: 'One', nodes: [node('a')], edges: [] }, { id: 'p2', name: 'Two', nodes: [node('q')], edges: [] }] }), 'x');
    const out = readProject(d, { id: 'f1' });
    expect(out.pages.map((p) => p.id)).toEqual(['p1']);
  });

  it('the synced cache skips untouched node objects', () => {
    const d = new Y.Doc();
    const cache = new WeakSet<object>();
    const p = proj();
    writeProject(d, p, 'x', cache);
    // tamper behind the cache's back: the same object must NOT be rewritten
    const yn = d.getMap('nodes').get('a') as Y.Map<any>;
    yn.set('type', 'tampered');
    writeProject(d, p, 'x', cache);
    expect(yn.get('type')).toBe('tampered');
    writeProject(d, p);
    expect(yn.get('type')).toBe('icon');
  });

  it('seed viewport only on page creation; settings/assets are shared', () => {
    const d = new Y.Doc();
    writeProject(d, proj({ settings: { grid: true } as never, assets: { h: { mime: 'image/png', data: 'AA' } } as never }), 'x');
    const out = readProject(d, { id: 'f1' });
    expect(out.settings).toEqual({ grid: true });
    expect(out.assets).toEqual({ h: { mime: 'image/png', data: 'AA' } });
  });

  it('syncs design-tool node fields (instance, autoLayout, link, constraints) as nested data', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const data = {
      label: 'card',
      instance: { componentId: 'cmp_1', rev: 2, overrides: { k1: { label: 'X' } } },
      autoLayout: { mode: 'row', gap: 8, padding: 12, align: 'center', justify: 'start', hugW: true, hugH: false },
      link: { fileId: 'fil_2', nodeId: 'n9' },
      constraints: { h: 'right', v: 'scale' },
      hidden: true,
    };
    writeProject(a, proj({ pages: [{ id: 'p1', name: 'P', nodes: [node('a', 0, { data })], edges: [] }] }), 'x');
    sync(a, b);
    expect(readProject(b, { id: 'f1' }).pages[0].nodes[0].data).toEqual(data);
    // changing one nested override on A is seen by B
    writeProject(a, proj({ pages: [{ id: 'p1', name: 'P', nodes: [node('a', 0, { data: { ...data, instance: { ...data.instance, rev: 3 } } })], edges: [] }] }), 'x');
    sync(a, b);
    expect((readProject(b, { id: 'f1' }).pages[0].nodes[0].data as any).instance.rev).toBe(3);
  });

  it('syncs page guides atomically and drops them when empty', () => {
    const a = new Y.Doc();
    const b = new Y.Doc();
    const guides = [{ id: 'g1', axis: 'x', pos: 100 }, { id: 'g2', axis: 'y', pos: 40 }];
    const p = proj();
    writeProject(a, { ...p, pages: [{ ...p.pages[0], guides }] }, 'x');
    sync(a, b);
    expect(readProject(b, { id: 'f1' }).pages[0].guides).toEqual(guides);
    writeProject(a, { ...p, pages: [{ ...p.pages[0], guides: [guides[0]] }] }, 'x');
    sync(a, b);
    expect(readProject(b, { id: 'f1' }).pages[0].guides).toEqual([guides[0]]);
    writeProject(a, { ...p, pages: [{ ...p.pages[0], guides: [] }] }, 'x');
    sync(a, b);
    expect(readProject(b, { id: 'f1' }).pages[0]).not.toHaveProperty('guides');
    expect(readProject(a, { id: 'f1' }).pages[0]).not.toHaveProperty('guides');
  });

  describe('several pages', () => {
    const multi = (): YProject => proj({ pages: [
      { id: 'p1', name: 'Page 1', nodes: [node('a')], edges: [] },
      { id: 'p2', name: 'Second', nodes: [node('c'), node('d', 50)], edges: [{ id: 'e2', source: 'c', target: 'd' }], flow: true, guides: [{ id: 'g', axis: 'x', pos: 3 }] },
      { id: 'p3', name: 'Third', nodes: [node('z')], edges: [] },
    ] });

    it('round-trips every page, in order, through a synced doc', () => {
      const a = new Y.Doc();
      const b = new Y.Doc();
      writeProject(a, multi(), 'x', undefined, { pages: 'all' });
      sync(a, b);
      const out = readProject(b, { id: 'f1' });
      expect(out.pages.map((p) => [p.id, p.name])).toEqual([['p1', 'Page 1'], ['p2', 'Second'], ['p3', 'Third']]);
      expect(out.pages[1].nodes.map((n) => n.id)).toEqual(['c', 'd']);
      expect(out.pages[1].edges.map((e) => e.id)).toEqual(['e2']);
      expect(out.pages[1].flow).toBe(true);
      expect(out.pages[1].guides).toEqual([{ id: 'g', axis: 'x', pos: 3 }]);
    });
    it('page-level diffs merge: two people edit different pages', () => {
      const a = new Y.Doc();
      const b = new Y.Doc();
      writeProject(a, multi(), 'x', undefined, { pages: 'all' });
      sync(a, b);
      const pa = readProject(a, { id: 'f1' });
      pa.pages[1].nodes.push(node('c2') as never);
      writeProject(a, pa, 'x', undefined, { pages: 'all' });
      const pb = readProject(b, { id: 'f1' });
      pb.pages[2].nodes.push(node('z2') as never);
      writeProject(b, pb, 'y', undefined, { pages: 'all' });
      sync(a, b);
      const out = readProject(a, { id: 'f1' });
      expect(out.pages[1].nodes.map((n) => n.id)).toEqual(['c', 'd', 'c2']);
      expect(out.pages[2].nodes.map((n) => n.id)).toEqual(['z', 'z2']);
    });
    it('a single-page write (the browser) leaves the other pages alone; "all" removes pages that are gone and reorders', () => {
      const d = new Y.Doc();
      writeProject(d, multi(), 'x', undefined, { pages: 'all' });
      const one = proj({ pages: [{ id: 'p1', name: 'Renamed', nodes: [node('a'), node('a2')], edges: [] }] });
      writeProject(d, one, 'x');
      let out = readProject(d, { id: 'f1' });
      expect(out.pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
      expect(out.pages[0].name).toBe('Renamed');
      const m = multi();
      writeProject(d, { ...m, pages: [m.pages[0], m.pages[2]] }, 'x', undefined, { pages: 'all' });
      out = readProject(d, { id: 'f1' });
      expect(out.pages.map((p) => p.id)).toEqual(['p1', 'p3']);
    });
    it('a doc written by the single-page layout still reads, and addMissingPages migrates it', () => {
      const d = new Y.Doc();
      writeProject(d, proj(), 'x'); // the old layout: one page at the root
      expect(readProject(d, { id: 'f1' }).pages).toHaveLength(1);
      const added = addMissingPages(d, multi(), 'migrate');
      expect(added).toBe(2);
      const out = readProject(d, { id: 'f1' });
      expect(out.pages.map((p) => p.id)).toEqual(['p1', 'p2', 'p3']);
      expect(out.pages[0].nodes.map((n) => n.id)).toEqual(['a', 'b']); // the first page is not touched
      expect(addMissingPages(d, multi(), 'migrate')).toBe(0);
    });
  });

  describe('deleteEntities', () => {
    it('removes nodes and edges of the first or of another page, with their order entries', () => {
      const d = new Y.Doc();
      const m = proj({ pages: [
        { id: 'p1', name: 'A', nodes: [node('a'), node('b')], edges: [{ id: 'e1', source: 'a', target: 'b' }] },
        { id: 'p2', name: 'B', nodes: [node('c'), node('d')], edges: [{ id: 'e2', source: 'c', target: 'd' }] },
      ] });
      writeProject(d, m, 'x', undefined, { pages: 'all' });
      deleteEntities(d, 'p1', ['b'], ['e1'], 'y');
      deleteEntities(d, 'p2', ['d'], ['e2'], 'y');
      const out = readProject(d, { id: 'f1' });
      expect(out.pages[0].nodes.map((n) => n.id)).toEqual(['a']);
      expect(out.pages[0].edges).toEqual([]);
      expect(out.pages[1].nodes.map((n) => n.id)).toEqual(['c']);
      expect(out.pages[1].edges).toEqual([]);
    });
  });
});

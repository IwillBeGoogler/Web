import { describe, expect, it } from 'vitest';
import type { DiagramNode } from '../../types';
import { buildLayerRows, effectiveHiddenIds, exportContent, filterRows, moveLayer, toggleLayerFlag } from './layers';

const n = (id: string, over: Partial<DiagramNode> & { label?: string; data?: Record<string, unknown> } = {}): DiagramNode => {
  const { label, data, ...rest } = over;
  return { id, type: 'icon', position: { x: 0, y: 0 }, width: 40, height: 40, data: { label: label ?? id, ...data }, ...rest } as DiagramNode;
};
const doc = (): DiagramNode[] => [
  n('g', { type: 'group', width: 400, height: 300, label: 'Backend' }),
  n('a', { parentId: 'g', position: { x: 10, y: 10 } }),
  n('b', { parentId: 'g', position: { x: 80, y: 10 } }),
  n('f', { type: 'frame', position: { x: 600, y: 0 }, width: 300, height: 300, label: 'Slide' }),
  n('c', { position: { x: 650, y: 50 } }),
  n('d', { position: { x: 2000, y: 2000 } }),
];

describe('buildLayerRows', () => {
  it('lists the top-most layer first and nests children under groups', () => {
    const rows = buildLayerRows(doc(), { expanded: new Set(['g', 'f']) });
    expect(rows.map((r) => [r.id, r.depth])).toEqual([['d', 0], ['f', 0], ['c', 1], ['g', 0], ['b', 1], ['a', 1]]);
  });
  it('collapsed parents hide their children but still report hasChildren', () => {
    const rows = buildLayerRows(doc(), { expanded: new Set() });
    expect(rows.map((r) => r.id)).toEqual(['d', 'f', 'g']);
    expect(rows.find((r) => r.id === 'g')!.hasChildren).toBe(true);
    expect(rows.find((r) => r.id === 'd')!.hasChildren).toBe(false);
  });
  it('frames own the loose nodes inside them; sequence nodes expose their participants as read-only rows', () => {
    const seq = n('s', { type: 'sequence', data: { label: 's', participants: [{ id: 'p1', name: 'Web', kind: 'participant' }, { id: 'p2', name: 'DB', kind: 'database' }], items: [] } });
    const rows = buildLayerRows([...doc(), seq], { expanded: new Set(['s']) });
    const sub = rows.filter((r) => r.parentId === 's');
    expect(sub.map((r) => r.label)).toEqual(['Web', 'DB']);
    expect(sub.every((r) => r.virtual)).toBe(true);
  });
  it('lock and hide are inherited from the parent', () => {
    const nodes = doc().map((x) => (x.id === 'g' ? { ...x, data: { ...x.data, hidden: true, locked: true } } : x));
    const rows = buildLayerRows(nodes, { expanded: new Set(['g']) });
    const a = rows.find((r) => r.id === 'a')!;
    expect(a.effectiveHidden).toBe(true);
    expect(a.effectiveLocked).toBe(true);
    expect(a.hidden).toBe(false);
  });
  it('the search filter keeps matches and their ancestors, and expands them', () => {
    const rows = filterRows(buildLayerRows(doc(), { expanded: new Set() , all: true }), 'bac');
    expect(rows.map((r) => r.id)).toEqual(['g']);
    const rows2 = filterRows(buildLayerRows(doc(), { expanded: new Set(), all: true }), 'b');
    expect(rows2.map((r) => r.id)).toEqual(['g', 'b']); // "Backend" and b, with a collapsed-agnostic order top first
  });
});

describe('moveLayer', () => {
  it('reorders siblings (z-order): moving a to the end of g puts it above b', () => {
    const out = moveLayer(doc(), 'a', 'g', 1)!;
    const ids = out.map((x) => x.id);
    expect(ids.indexOf('a')).toBeGreaterThan(ids.indexOf('b'));
    expect(out.find((x) => x.id === 'a')!.parentId).toBe('g');
  });
  it('re-parents into a group keeping the absolute position', () => {
    const out = moveLayer(doc(), 'd', 'g', 0)!;
    const d = out.find((x) => x.id === 'd')!;
    expect(d.parentId).toBe('g');
    expect(d.position).toEqual({ x: 2000, y: 2000 });
    expect(out.findIndex((x) => x.id === 'g')).toBeLessThan(out.findIndex((x) => x.id === 'd')); // parents first
  });
  it('re-parents out of a group to the root', () => {
    const nodes = doc().map((x) => (x.id === 'g' ? { ...x, position: { x: 100, y: 100 } } : x));
    const out = moveLayer(nodes, 'a', null, 0)!;
    const a = out.find((x) => x.id === 'a')!;
    expect(a.parentId).toBeUndefined();
    expect(a.position).toEqual({ x: 110, y: 110 });
  });
  it('moves a whole subtree and refuses cycles / non-containers', () => {
    expect(moveLayer(doc(), 'g', 'a', 0)).toBeNull();
    expect(moveLayer(doc(), 'g', 'g', 0)).toBeNull();
    expect(moveLayer(doc(), 'c', 'd', 0)).toBeNull(); // d is an icon: not a container
    const out = moveLayer(doc(), 'g', null, 99)!;
    expect(out.map((x) => x.id).slice(-3)).toEqual(['g', 'a', 'b']);
  });
});

describe('flags and export', () => {
  it('toggleLayerFlag flips hidden / locked of one node', () => {
    const out = toggleLayerFlag(doc(), 'c', 'hidden');
    expect(out.find((x) => x.id === 'c')!.data.hidden).toBe(true);
    expect(toggleLayerFlag(out, 'c', 'hidden').find((x) => x.id === 'c')!.data.hidden).toBe(false);
  });
  it('hidden nodes (and the children of a hidden group) are excluded from export, with their edges', () => {
    const nodes = doc().map((x) => (x.id === 'g' || x.id === 'd' ? { ...x, data: { ...x.data, hidden: true } } : x));
    expect([...effectiveHiddenIds(nodes)].sort()).toEqual(['a', 'b', 'd', 'g']);
    const edges = [{ id: 'e1', source: 'a', target: 'c' }, { id: 'e2', source: 'c', target: 'f' }] as never;
    const out = exportContent(nodes, edges);
    expect(out.nodes.map((x) => x.id).sort()).toEqual(['c', 'f']);
    expect(out.edges.map((e) => e.id)).toEqual(['e2']);
  });
});

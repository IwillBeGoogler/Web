import { describe, expect, it } from 'vitest';
import { layoutActivity, backEdges } from './layout';
import { activitySize, withActivitySize } from './sizes';
import { ACTIVITY_KINDS, isPseudo } from './types';
import { activityModelToDiagram, diagramToActivityModel, formatGuard, parseGuard } from './convert';
import { tidyActivity } from './tidy';
import { activityNode, laneNode } from './nodes';
import type { ActivityModel } from './types';
import type { DiagramNode } from '../../types';

const m = (over: Partial<ActivityModel> = {}): ActivityModel => ({ lanes: [], nodes: [], flows: [], ...over });

describe('activity sizes / types', () => {
  it('sizes per kind', () => {
    expect(activitySize({ actKind: 'initial' })).toEqual({ width: 28, height: 28 });
    expect(activitySize({ actKind: 'fork', vertical: true })).toEqual({ width: 8, height: 120 });
    expect(activitySize({ actKind: 'fork' })).toEqual({ width: 120, height: 8 });
    expect(activitySize({ actKind: 'object', label: 'x', objectState: 's' }).height).toBe(62);
    expect(activitySize({ actKind: 'object', label: 'x' }).height).toBe(46);
    expect(activitySize({ actKind: 'send', label: 'a'.repeat(40) }).width).toBeGreaterThan(130);
    expect(activitySize({ actKind: 'note', label: 'a\nb\nc' }).height).toBe(79);
    expect(activitySize({ actKind: 'note' }).height).toBe(56);
    expect(activitySize({ actKind: 'action', label: 'one\ntwo\nthree' }).height).toBe(84);
    expect(activitySize({ actKind: 'action' }).height).toBe(48);
    expect(activitySize({ actKind: 'final' }).width).toBe(36);
    expect(activitySize({ actKind: 'flowFinal' }).width).toBe(30);
    expect(activitySize({ actKind: 'decision' }).width).toBe(56);
  });
  it('withActivitySize writes width/height/style', () => {
    const n = withActivitySize({ id: 'a', type: 'activity', position: { x: 0, y: 0 }, data: { actKind: 'initial' }, style: { color: 'red' } } as unknown as DiagramNode);
    expect(n.style).toMatchObject({ width: 28, height: 28, color: 'red' });
    const k = withActivitySize({ id: 'a', type: 'activity', position: { x: 0, y: 0 }, data: { actKind: 'initial' } } as unknown as DiagramNode);
    expect(k.width).toBe(28);
  });
  it('isPseudo', () => {
    expect(ACTIVITY_KINDS.filter(isPseudo)).toEqual(['initial', 'final', 'flowFinal', 'fork']);
  });
});

describe('layoutActivity', () => {
  it('empty model', () => {
    const l = layoutActivity(m());
    expect(l.boxes.size).toBe(0);
  });
  it('horizontal with lanes, fork bars, notes (attached & stray), loops, self-flows', () => {
    const model = m({
      orientation: 'h',
      lanes: [{ id: 'l1', name: 'A' }, { id: 'l2', name: 'B' }],
      nodes: [
        { id: 'a', name: '', kind: 'initial', lane: 'l1' }, { id: 'f', name: '', kind: 'fork' }, { id: 'b', name: 'B', kind: 'action', lane: 'l2' },
        { id: 'c', name: 'C', kind: 'action' }, { id: 'j', name: '', kind: 'fork' }, { id: 'n1', name: 'n', kind: 'note' }, { id: 'n2', name: 'n2', kind: 'note' },
        { id: 'n3', name: 'n3', kind: 'note' }, { id: 'lone', name: 'L', kind: 'fork' },
      ],
      flows: [
        { from: 'a', to: 'f' }, { from: 'f', to: 'b' }, { from: 'f', to: 'c' }, { from: 'b', to: 'j' }, { from: 'c', to: 'j' }, { from: 'j', to: 'f' },
        { from: 'b', to: 'b' }, { from: 'n1', to: 'b', note: true }, { from: 'b', to: 'n3', note: true }, { from: 'n1', to: 'n2', note: true },
      ],
    });
    const l = layoutActivity(model);
    expect(l.orientation).toBe('h');
    expect(l.vertical.has('f')).toBe(true);
    expect(l.boxes.get('n1')!.x).toBeGreaterThan(l.boxes.get('b')!.x - 1);
    expect(l.boxes.get('n2')).toBeDefined();
    expect(l.boxes.get('a')!.x).toBeLessThan(l.boxes.get('b')!.x);
    expect(l.lanes.get('l2')!.y).toBeGreaterThan(l.lanes.get('l1')!.y);
    expect(l.boxes.has('lone')).toBe(true);
  });
  it('vertical with a vertical fork keeps its size; nodes with unknown lane use neighbour lane', () => {
    const l = layoutActivity(m({
      lanes: [{ id: 'l1', name: 'A' }, { id: 'l2', name: 'B' }],
      nodes: [{ id: 'a', name: 'a', kind: 'action', lane: 'l2' }, { id: 'v', name: '', kind: 'fork', vertical: true }, { id: 'b', name: 'b', kind: 'action' }, { id: 'x', name: 'x', kind: 'action', lane: 'ghost' }, { id: 'y', name: 'y', kind: 'action' }],
      flows: [{ from: 'a', to: 'v' }, { from: 'v', to: 'b' }],
    }));
    expect(l.boxes.get('v')!.h).toBe(120);
    expect(l.boxes.get('b')!.x).toBeGreaterThanOrEqual(l.lanes.get('l2')!.x);
    expect(l.boxes.get('y')!.x).toBeGreaterThanOrEqual(l.lanes.get('l1')!.x);
  });
  it('backEdges finds loop edges only', () => {
    const b = backEdges(['a', 'b', 'c'], [{ from: 'a', to: 'b' }, { from: 'b', to: 'c' }, { from: 'c', to: 'a' }]);
    expect([...b]).toEqual([2]);
  });
});

describe('guards', () => {
  it('format / parse', () => {
    expect(formatGuard(undefined)).toBeUndefined();
    expect(formatGuard('  ')).toBeUndefined();
    expect(formatGuard('[x]')).toBe('[x]');
    expect(formatGuard('x')).toBe('[x]');
    expect(parseGuard(5)).toBeUndefined();
    expect(parseGuard('[ ]')).toBeUndefined();
    expect(parseGuard('[ok]')).toBe('ok');
  });
});

describe('convert & tidy', () => {
  const model = m({
    orientation: 'h',
    lanes: [{ id: 'l', name: 'Lane' }],
    nodes: [
      { id: 'a', name: '', kind: 'initial', lane: 'l' }, { id: 'f', name: '', kind: 'fork' }, { id: 'b', name: 'B', kind: 'action', lane: 'l' },
      { id: 'o', name: 'O', kind: 'object', state: 'st' }, { id: 'v', name: '', kind: 'fork', vertical: true }, { id: 'n', name: 'note', kind: 'note' },
    ],
    flows: [{ from: 'a', to: 'f' }, { from: 'f', to: 'b', guard: 'g' }, { from: 'f', to: 'o' }, { from: 'b', to: 'v' }, { from: 'b', to: 'n', note: true }, { from: 'zz', to: 'a' }],
  });
  it('model -> diagram -> model keeps structure', () => {
    const d = activityModelToDiagram(model, { x: 100, y: 50 });
    expect(d.nodes.filter((n) => n.type === 'group')).toHaveLength(1);
    expect(d.edges).toHaveLength(5);
    expect(d.edges.find((e) => e.label === '[g]')).toBeDefined();
    const back = diagramToActivityModel(d.nodes, d.edges);
    expect(back.orientation).toBe('h');
    expect(back.nodes).toHaveLength(6);
    expect(back.nodes.find((n) => n.state === 'st')).toBeDefined();
    expect(back.nodes.find((n) => n.vertical)).toBeDefined();
    expect(back.flows.find((f) => f.guard === 'g')).toBeDefined();
    expect(back.flows.filter((f) => f.note)).toHaveLength(1);
    expect(back.nodes.find((n) => n.id === 'act3')!.lane).toBe('lane1');
  });
  it('diagramToActivityModel drops foreign edges and defaults orientation v', () => {
    const a = activityNode('a', { x: 0, y: 0 });
    const b = activityNode('b', { x: 0, y: 100 });
    const lane = laneNode('l', { x: 0, y: 0 }, undefined as unknown as string);
    const mod = diagramToActivityModel([a, b, { ...lane, data: { ...lane.data, label: undefined, laneOrient: 'v' } } as DiagramNode], [
      { id: 'e1', source: 'a', target: 'b' } as never,
      { id: 'e2', source: 'a', target: 'x' } as never,
      { id: 'e3', source: 'a', target: 'b', data: { uml: { kind: 'association' } } } as never,
    ]);
    expect(mod.orientation).toBe('v');
    expect(mod.lanes[0].name).toBe('Lane');
    expect(mod.flows).toHaveLength(1);
    expect(diagramToActivityModel([], []).orientation).toBe('v');
  });
  it('tidyActivity: null when empty; positions nodes, lanes, forks', () => {
    expect(tidyActivity([], [])).toBeNull();
    const d = activityModelToDiagram(model, { x: 100, y: 50 });
    const scrambled = d.nodes.map((n) => ({ ...n, position: n.parentId ? { x: 1, y: 1 } : { x: n.position.x + 7, y: n.position.y + 9 } }));
    const t = tidyActivity([...scrambled, { id: 'other', type: 'icon', position: { x: 0, y: 0 }, data: {} } as unknown as DiagramNode], d.edges)!;
    expect(t.count).toBe(6);
    expect(t.nodes.find((n) => n.id === 'other')!.position).toEqual({ x: 0, y: 0 });
    const lane = t.nodes.find((n) => n.type === 'group')!;
    expect(lane.width).toBeGreaterThan(0);
    const fork = t.nodes.find((n) => n.data.actKind === 'fork')!;
    expect(fork.data.vertical).toBe(true);
    const inner = t.nodes.find((n) => n.parentId)!;
    expect(inner.position.x).toBeGreaterThanOrEqual(0);
  });
  it('tidy vertical orientation keeps a fork bar horizontal, and no lane nodes', () => {
    const vm = m({ nodes: [{ id: 'f', name: '', kind: 'fork' }, { id: 'a', name: 'A', kind: 'action' }], flows: [{ from: 'f', to: 'a' }] });
    const d = activityModelToDiagram(vm);
    const t = tidyActivity(d.nodes, d.edges)!;
    expect(t.nodes.find((n) => n.data.actKind === 'fork')!.data.vertical).toBe(false);
    const vv = tidyActivity(d.nodes.map((n) => (n.data.actKind === 'fork' ? { ...n, data: { ...n.data, vertical: true } } : n)), d.edges)!;
    expect(vv.nodes.find((n) => n.data.actKind === 'fork')!.data.vertical).toBe(true);
  });
});

describe('tidy extra', () => {
  it('all nodes inside lanes; node under a non-lane parent', () => {
    const vm = m({ lanes: [{ id: 'l', name: 'L' }], nodes: [{ id: 'a', name: 'A', kind: 'action', lane: 'l' }, { id: 'b', name: 'B', kind: 'action', lane: 'l' }], flows: [{ from: 'a', to: 'b' }] });
    const d = activityModelToDiagram(vm);
    const t = tidyActivity(d.nodes, d.edges)!;
    expect(t.nodes.find((n) => n.id === 'act1')!.parentId).toBe('lane1');
    const grp = { id: 'g', type: 'group', position: { x: 0, y: 0 }, data: { label: 'g' } } as unknown as DiagramNode;
    const nested = { ...activityNode('z', { x: 5, y: 5 }), parentId: 'g' } as DiagramNode;
    const t2 = tidyActivity([grp, nested], [])!;
    expect(t2.count).toBe(1);
    expect(t2.nodes.find((n) => n.id === 'z')!.position.x).toBeGreaterThanOrEqual(0);
  });
});

describe('tidy fork without style', () => {
  it('handles missing style on bars and lanes', () => {
    const vm = m({ lanes: [{ id: 'l', name: 'L' }], nodes: [{ id: 'f', name: '', kind: 'fork', lane: 'l' }, { id: 'a', name: 'A', kind: 'action', lane: 'l' }], flows: [{ from: 'f', to: 'a' }] });
    const d = activityModelToDiagram(vm);
    const stripped = d.nodes.map((n) => { const { style: _s, ...r } = n; return r as DiagramNode; });
    const t = tidyActivity(stripped, d.edges)!;
    expect(t.nodes.find((n) => n.data.actKind === 'fork')!.style).toMatchObject({ width: expect.any(Number) });
    expect(t.nodes.find((n) => n.type === 'group')!.style).toMatchObject({ height: expect.any(Number) });
  });
});

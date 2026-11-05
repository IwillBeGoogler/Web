import { describe, expect, it } from 'vitest';
import { addTag, cardSize, moveTag, removeTag, TAG_COLORS, updateTag } from './card';
import { BUILTIN_EDGE_PRESETS, allEdgePresets, findPreset, presetPatch } from './edgePresets';
import { addJunction, isJunction, junctionEnds } from './junction';
import { repeatBase, repeatGroup } from './repeat';
import { absolutePosition, nodeSize } from './graph';
import { overlaps } from './placement';
import { validateDiagram, serializeDiagram } from './serialization';
import { createNodeFromPaletteItem, getItem } from '../data/palette';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramEdge, DiagramNode } from '../types';

const ic = (id: string, x: number, y: number, parentId?: string): DiagramNode => ({ id, type: 'icon', position: { x, y }, ...(parentId ? { parentId } : {}), data: { label: id, iconId: 'service' } });
const grp = (id: string, x: number, y: number, label = 'server'): DiagramNode => ({ id, type: 'group', position: { x, y }, width: 200, height: 160, data: { label } });
const ed = (id: string, source: string, target: string, data = {}): DiagramEdge => ({ id, source, target, data });
let c = 0;
const gen = (p: string) => `${p}${++c}`;

describe('card tags', () => {
  it('add / update / remove / move', () => {
    let t = addTag([], 'Prod');
    t = addTag(t, 'EU', '#000000');
    expect(t).toEqual([{ text: 'Prod', color: TAG_COLORS[0] }, { text: 'EU', color: '#000000' }]);
    t = updateTag(t, 0, { text: 'Staging' });
    expect(t[0].text).toBe('Staging');
    expect(moveTag(t, 0, 1).map((x) => x.text)).toEqual(['EU', 'Staging']);
    expect(removeTag(t, 1)).toHaveLength(1);
    expect(moveTag(t, 5, 0)).toBe(t);
  });
  it('size grows with tags', () => {
    expect(cardSize([{ text: 'a', color: '#fff' }, { text: 'b', color: '#fff' }]).height).toBeGreaterThan(cardSize([]).height);
    expect(cardSize([], 'horizontal').width).toBeGreaterThan(cardSize([], 'vertical').width);
  });
});

describe('palette: card, cylinder, ellipsis, junction, title, group variants', () => {
  const make = (id: string) => createNodeFromPaletteItem(getItem(id)!, { x: 0, y: 0 }, 'x');
  it('cylinder + ellipsis shapes', () => {
    expect(make('cylinder').data.shape).toBe('cylinder');
    expect(make('ellipsis').data.shape).toBe('ellipsis');
  });
  it('card has tags and a layout', () => {
    const n = make('card');
    expect(n.type).toBe('card');
    expect(n.data.tags!.length).toBeGreaterThan(0);
    expect(n.data.layout).toBe('vertical');
    expect(make('card-horizontal').data.layout).toBe('horizontal');
  });
  it('junction is a tiny node', () => {
    const n = make('junction');
    expect(n.type).toBe('junction');
    expect(nodeSize(n).width).toBeLessThanOrEqual(12);
  });
  it('title preset is large + bold', () => {
    const n = make('title');
    expect(n.type).toBe('text');
    expect(n.data.fontSize).toBeGreaterThanOrEqual(26);
    expect(n.data.bold).toBe(true);
  });
  it('group variants', () => {
    expect(make('group-dashed').data.variant).toBe('dashed');
    expect(make('group-card').data.variant).toBe('card');
  });
});

describe('repeat group', () => {
  it('server -> server-1..N with ellipsis and cloned children, no overlaps', () => {
    const nodes = [grp('g', 0, 0), ic('a', 20, 50, 'g'), ic('b', 20, 100, 'g')];
    const out = repeatGroup(nodes, 'g', 3, gen);
    const groups = out.filter((n) => n.type === 'group');
    expect(groups.map((g) => g.data.label)).toEqual(['server-1', 'server-2', 'server-3']);
    expect(out.filter((n) => n.data.shape === 'ellipsis')).toHaveLength(1);
    expect(out.filter((n) => n.type === 'icon')).toHaveLength(6);
    expect(new Set(out.map((n) => n.id)).size).toBe(out.length);
    for (const g of groups.slice(1)) expect(out.filter((n) => n.parentId === g.id)).toHaveLength(2);
    const boxes = out.filter((n) => !n.parentId).map((n) => ({ ...absolutePosition(out, n), ...nodeSize(n) }));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) expect(overlaps(boxes[i], boxes[j])).toBe(false);
  });
  it('two copies have no ellipsis; strips existing suffix; count<2 is a no-op', () => {
    const nodes = [grp('g', 0, 0, 'web-7')];
    expect(repeatBase('web-7')).toBe('web');
    const out = repeatGroup(nodes, 'g', 2, gen);
    expect(out.map((n) => n.data.label)).toEqual(['web-1', 'web-2']);
    expect(repeatGroup(nodes, 'g', 1, gen)).toBe(nodes);
  });
  it('store action is undoable', () => {
    const s = () => useDiagramStore.getState();
    s().reset();
    s().addNodes([grp('g', 0, 0), ic('a', 20, 50, 'g')]);
    s().repeatGroup('g', 4);
    expect(s().nodes.filter((n) => n.type === 'group')).toHaveLength(4);
    s().undo();
    expect(s().nodes).toHaveLength(2);
  });
});

describe('junction bus', () => {
  const nodes = [ic('a', 0, 0), ic('b', 0, 200), ic('c', 0, 400), ic('t', 400, 200)];
  const edges = [ed('e1', 'a', 't', { color: '#d9480f' }), ed('e2', 'b', 't', { color: '#d9480f' }), ed('e3', 'c', 't', { color: '#d9480f' })];
  it('fan-in merges through a junction before the target; arrow only on the trunk', () => {
    const r = addJunction(nodes, edges, ['e1', 'e2', 'e3'], gen)!;
    const j = r.nodes.find((n) => n.id === r.junctionId)!;
    expect(isJunction(j)).toBe(true);
    expect(j.position.x).toBeLessThan(400);
    expect(r.edges).toHaveLength(4);
    expect(r.edges.filter((e) => e.target === j.id)).toHaveLength(3);
    const trunk = r.edges.find((e) => e.source === j.id)!;
    expect(trunk.target).toBe('t');
    for (const e of r.edges.filter((e) => e.target === j.id)) expect(junctionEnds(r.nodes, e)).toEqual({ noStart: false, noEnd: true });
    expect(junctionEnds(r.nodes, trunk)).toEqual({ noStart: true, noEnd: false });
    expect(r.edges.every((e) => e.data?.color === '#d9480f')).toBe(true);
  });
  it('refuses edges with no shared end or fewer than two', () => {
    expect(addJunction(nodes, [ed('x', 'a', 't'), ed('y', 'b', 'c')], ['x', 'y'], gen)).toBeNull();
    expect(addJunction(nodes, edges, ['e1'], gen)).toBeNull();
  });
  it('fan-out works too', () => {
    const r = addJunction(nodes, [ed('x', 't', 'a'), ed('y', 't', 'b')], ['x', 'y'], gen)!;
    expect(r.edges.filter((e) => e.source === r.junctionId)).toHaveLength(2);
    expect(r.edges.filter((e) => e.target === r.junctionId)).toHaveLength(1);
  });
  it('store action + undo', () => {
    const s = () => useDiagramStore.getState();
    s().reset();
    s().addNodes(nodes);
    s().loadDiagram({ nodes, edges });
    s().mergeIntoJunction(['e1', 'e2', 'e3']);
    expect(s().nodes.some(isJunction)).toBe(true);
    s().undo();
    expect(s().nodes.some(isJunction)).toBe(false);
  });
});

describe('edge presets', () => {
  it('builtin set', () => {
    expect(BUILTIN_EDGE_PRESETS.map((p) => p.id)).toEqual(['metrics', 'logs', 'traces', 'control', 'backup']);
    expect(findPreset('backup')!.strokeStyle).toBe('dashed');
  });
  it('user presets append and may override a builtin', () => {
    const all = allEdgePresets([{ id: 'mine', name: 'Mine', color: '#123456' }, { id: 'logs', name: 'Logs!', color: '#000000' }]);
    expect(all.find((p) => p.id === 'mine')).toBeTruthy();
    expect(all.find((p) => p.id === 'logs')!.color).toBe('#000000');
    expect(all).toHaveLength(6);
  });
  it('patch carries colour + label styling; applying via store', () => {
    expect(presetPatch(findPreset('metrics')!)).toMatchObject({ preset: 'metrics', color: '#d9480f', labelColor: '#d9480f', labelBold: true });
    const s = () => useDiagramStore.getState();
    s().reset();
    s().addNodes([ic('a', 0, 0), ic('b', 300, 0)]);
    s().connect({ source: 'a', target: 'b', sourceHandle: 'right', targetHandle: 'left' });
    const id = s().edges[0].id;
    s().applyEdgePreset([id], 'logs');
    expect(s().edges[0].data).toMatchObject({ preset: 'logs', color: '#1971c2' });
    s().undo();
    expect(s().edges[0].data?.preset).toBeUndefined();
  });
});

describe('serialization of new fields', () => {
  it('round-trips card tags, cylinder, edge label styling', () => {
    const nodes: DiagramNode[] = [
      { id: 'c1', type: 'card', position: { x: 0, y: 0 }, width: 200, height: 120, data: { label: 'API', iconId: 'go', tags: [{ text: 'prod', color: '#1971c2' }], layout: 'vertical' } },
      { id: 's1', type: 'shape', position: { x: 300, y: 0 }, width: 80, height: 90, data: { label: 'DB', shape: 'cylinder' } },
      { id: 'j1', type: 'junction', position: { x: 200, y: 0 }, width: 10, height: 10, data: { label: '' } },
    ];
    const edges: DiagramEdge[] = [{ id: 'e', source: 'c1', target: 's1', data: { labelColor: '#d9480f', labelBold: true, preset: 'metrics' } }];
    const r = validateDiagram(JSON.parse(serializeDiagram({ version: 1, nodes, edges })));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.diagram.nodes[0].data.tags).toEqual([{ text: 'prod', color: '#1971c2' }]);
      expect(r.diagram.edges[0].data?.labelBold).toBe(true);
    }
  });
});

import { flattenMenu, getMenuItems } from './menu';
import { executeAction } from './actions';
import { mergeSettings, resolveSettings, validateSettings } from './settings';

describe('menus + actions for the medium style', () => {
  const ctx = (nodes: DiagramNode[], edges: DiagramEdge[], userPresets = []) => ({ nodes, edges, hasClipboard: false, hasStyleClip: false, pageCount: 1, userPresets });
  it('group menu offers Repeat group; clusters do not', () => {
    const items = flattenMenu(getMenuItems({ type: 'node', id: 'g' }, ctx([grp('g', 0, 0)], [])));
    expect(items.some((i) => i.id === 'repeat:3')).toBe(true);
    const cl: DiagramNode = { id: 'c', type: 'cluster', position: { x: 0, y: 0 }, data: { label: 'c' } };
    expect(flattenMenu(getMenuItems({ type: 'node', id: 'c' }, ctx([cl], []))).some((i) => i.id === 'repeat:3')).toBe(false);
  });
  it('edge menu lists builtin + user presets', () => {
    const items = flattenMenu(getMenuItems({ type: 'edge', id: 'e' }, ctx([ic('a', 0, 0), ic('b', 1, 1)], [ed('e', 'a', 'b')], [{ id: 'mine', name: 'Mine', color: '#123456' }] as never)));
    for (const id of ['metrics', 'logs', 'traces', 'control', 'backup', 'mine']) expect(items.some((i) => i.id === `preset:${id}`), id).toBe(true);
  });
  it('multi-edge selection offers merge into junction', () => {
    const es = [ed('e1', 'a', 't'), ed('e2', 'b', 't')].map((e) => ({ ...e, selected: true }));
    const items = flattenMenu(getMenuItems({ type: 'selection' }, ctx([ic('a', 0, 0), ic('b', 0, 100), ic('t', 300, 50)], es)));
    expect(items.some((i) => i.id === 'merge-junction')).toBe(true);
  });
  it('executeAction repeat / preset / merge-junction', () => {
    const s = () => useDiagramStore.getState();
    s().reset();
    s().loadDiagram({ nodes: [grp('g', 0, 0), ic('a', 0, 300), ic('b', 0, 500), ic('t', 400, 400)], edges: [ed('e1', 'a', 't'), ed('e2', 'b', 't')] });
    executeAction('repeat:3', { nodeId: 'g' });
    expect(s().nodes.filter((n) => n.type === 'group')).toHaveLength(3);
    useDiagramStore.setState((st) => ({ edges: st.edges.map((e) => ({ ...e, selected: true })) }));
    executeAction('preset:traces');
    expect(s().edges.every((e) => e.data?.color === '#0c8599')).toBe(true);
    executeAction('merge-junction');
    expect(s().nodes.some(isJunction)).toBe(true);
  });
  it('user presets validate, persist through merge, and resolve', () => {
    const v = validateSettings({ edgePresets: [{ id: 'x', name: 'X', color: '#fff' }, { bad: true }] });
    expect(v.edgePresets).toHaveLength(1);
    expect(resolveSettings(v, undefined).edgePresets).toHaveLength(1);
    expect(mergeSettings(v, { edge: { width: 3 } }).edgePresets).toHaveLength(1);
    expect(resolveSettings(undefined, undefined).edgePresets).toEqual([]);
  });
});

describe('gaps: preset merge + mixed selection', () => {
  it('global and project presets are merged by id (project wins)', () => {
    const r = resolveSettings({ edgePresets: [{ id: 'a', name: 'GA', color: '#111111' }, { id: 'b', name: 'GB', color: '#222222' }] }, { edgePresets: [{ id: 'b', name: 'PB', color: '#333333' }, { id: 'c', name: 'PC', color: '#444444' }] });
    expect(r.edgePresets.map((p) => `${p.id}:${p.name}`)).toEqual(['a:GA', 'b:PB', 'c:PC']);
  });
  it('mixed node+edge selection menu offers edge options and styles both', () => {
    const nodes = [{ ...ic('a', 0, 0), selected: true }, ic('b', 300, 0)];
    const edges = [{ ...ed('e', 'a', 'b'), selected: true }];
    const items = flattenMenu(getMenuItems({ type: 'selection' }, { nodes, edges, hasClipboard: false, hasStyleClip: false, pageCount: 1 }));
    for (const id of ['lineType:straight', 'arrows:both', 'strokeStyle:dashed', 'fill:#ffffff'.replace('#ffffff', '') ]) void id;
    expect(items.some((i) => i.id === 'lineType:straight')).toBe(true);
    expect(items.some((i) => i.id === 'strokeStyle:dashed')).toBe(true);
    const s = () => useDiagramStore.getState();
    s().reset();
    s().loadDiagram({ nodes, edges });
    executeAction('strokeStyle:dashed');
    expect(s().edges[0].data?.strokeStyle).toBe('dashed');
    expect(s().nodes[0].data.strokeStyle).toBe('dashed');
  });
});

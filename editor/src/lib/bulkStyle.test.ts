import { describe, expect, it } from 'vitest';
import { applyBulk, computeMixed, computeMixedEdges, fieldPatch, matchSize, resetStyle, selectSimilar } from './bulkStyle';
import { resolveSettings } from './settings';
import { nodeSize } from './graph';
import { useDiagramStore } from '../store/diagramStore';
import { executeAction } from './actions';
import { flattenMenu, getMenuItems } from './menu';
import type { DiagramEdge, DiagramNode } from '../types';

const settings = resolveSettings(undefined, undefined);
const n = (id: string, type: DiagramNode['type'], data: Partial<DiagramNode['data']> = {}, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type, position: { x: 0, y: 0 }, width: 100, height: 60, data: { label: id, ...data }, ...extra });
const e = (id: string, data: DiagramEdge['data'] = {}): DiagramEdge => ({ id, source: 'a', target: 'b', data });

describe('mixed-value computation', () => {
  it('same value is not mixed; different is; only applicable kinds count', () => {
    const nodes = [n('a', 'shape', { fill: '#ff0000' }), n('b', 'shape', { fill: '#ff0000' }), n('c', 'group', { fill: '#00ff00' }), n('d', 'text', { fontSize: 20 })];
    const m = computeMixed(nodes, settings);
    expect(m.fill).toMatchObject({ applicable: 4, mixed: true });
    const sameFill = computeMixed(nodes.slice(0, 2), settings);
    expect(sameFill.fill).toMatchObject({ applicable: 2, mixed: false, value: '#ff0000' });
    expect(m.shadow!.applicable).toBe(2); // shapes only (not group/text)
    expect(m.iconSize).toBeUndefined(); // no icon node selected
    expect(m.fontSize).toMatchObject({ mixed: true }); // 12 (shape default) vs 20 (text)
  });
  it('defaults resolve through settings so untouched nodes compare equal', () => {
    const m = computeMixed([n('a', 'icon'), n('b', 'icon')], settings);
    expect(m.radius!.mixed).toBe(false);
    expect(m.background!.value).toBe('transparent');
  });
  it('edges: colour / preset / line type mixed detection', () => {
    const m = computeMixedEdges([e('1', { color: '#d9480f', preset: 'metrics' }), e('2', { color: '#1971c2', preset: 'logs', lineType: 'straight' })], settings);
    expect(m.color!.mixed).toBe(true);
    expect(m.preset!.mixed).toBe(true);
    expect(m.lineType!.mixed).toBe(true);
    expect(m.arrows!.mixed).toBe(false);
    expect(computeMixedEdges([], settings)).toEqual({});
  });
});

describe('bulk apply respects applicability', () => {
  it('only touches fields that apply to each kind; groups map opacity to fillOpacity', () => {
    const nodes = [n('i', 'icon'), n('s', 'shape'), n('g', 'group'), n('t', 'text'), n('x', 'junction')];
    const { nodes: out, changed } = applyBulk(nodes, ['i', 's', 'g', 't', 'x'], { shadow: true, iconSize: 64, opacity: 40, fill: '#abcdef' });
    const by = (id: string) => out.find((o) => o.id === id)!.data;
    expect(by('i')).toMatchObject({ shadow: true, iconSize: 64, opacity: 40, fill: '#abcdef' });
    expect(by('s')).toMatchObject({ shadow: true, opacity: 40 });
    expect(by('s').iconSize).toBeUndefined();
    expect(by('g')).toMatchObject({ fillOpacity: 40, fill: '#abcdef' });
    expect(by('g').shadow).toBeUndefined();
    expect(by('t').shadow).toBeUndefined();
    expect(by('t').fill).toBe('#abcdef');
    expect(by('x')).toEqual({ label: 'x' }); // junction: nothing applies
    expect(changed).toBe(4);
  });
  it('unselected nodes are untouched; fieldPatch returns null when not applicable', () => {
    const nodes = [n('a', 'shape'), n('b', 'shape')];
    const { nodes: out } = applyBulk(nodes, ['a'], { fill: '#111111' });
    expect(out[1]).toBe(nodes[1]);
    expect(fieldPatch(n('j', 'junction'), 'fill', '#fff')).toBeNull();
  });
});

describe('select similar', () => {
  const nodes = [n('a', 'icon', { iconId: 'redis' }), n('b', 'icon', { iconId: 'redis' }), n('c', 'icon', { iconId: 'kafka' }), n('d', 'shape'), n('e', 'cluster', { profileId: 'kafka' }), n('f', 'cluster', { profileId: 'kafka' })];
  const edges = [e('1', { preset: 'metrics' }), e('2', { preset: 'metrics' }), e('3', { preset: 'logs' }), e('4')];
  it('same type / same icon', () => {
    expect(selectSimilar(nodes, edges, { kind: 'node', id: 'a' }, 'type').nodeIds).toEqual(['a', 'b', 'c']);
    expect(selectSimilar(nodes, edges, { kind: 'node', id: 'a' }, 'icon').nodeIds).toEqual(['a', 'b']);
    expect(selectSimilar(nodes, edges, { kind: 'node', id: 'e' }, 'preset').nodeIds).toEqual(['e', 'f']);
  });
  it('same edge preset; edges without a preset match each other', () => {
    expect(selectSimilar(nodes, edges, { kind: 'edge', id: '1' }, 'preset').edgeIds).toEqual(['1', '2']);
    expect(selectSimilar(nodes, edges, { kind: 'edge', id: '4' }, 'preset').edgeIds).toEqual(['4']);
    expect(selectSimilar(nodes, edges, { kind: 'edge', id: '1' }, 'type').edgeIds).toHaveLength(4);
  });
  it('unknown anchor selects nothing', () => expect(selectSimilar(nodes, edges, { kind: 'node', id: 'zzz' }, 'type')).toEqual({ nodeIds: [], edgeIds: [] }));
});

describe('match size and reset style', () => {
  it('match size copies the first resizable selected node size, skipping locked / icons', () => {
    const nodes = [n('a', 'shape', {}, { width: 200, height: 120 }), n('b', 'shape'), n('c', 'shape', { locked: true }), n('i', 'icon')];
    const r = matchSize(nodes, ['a', 'b', 'c', 'i']);
    expect(nodeSize(r.nodes[1])).toEqual({ width: 200, height: 120 });
    expect(nodeSize(r.nodes[2])).toEqual({ width: 100, height: 60 });
    expect(r.nodes[3]).toBe(nodes[3]);
    expect(r.changed).toBe(1);
  });
  it('reset style removes overrides but keeps label, icon and structure', () => {
    const nodes = [n('a', 'shape', { fill: '#fff', radius: 3, fontSize: 20, iconId: 'x' }), n('b', 'shape', { fill: '#fff' })];
    const r = resetStyle(nodes, [e('1', { color: '#f00', preset: 'metrics', waypoints: [{ x: 1, y: 2 }] })], ['a'], ['1']);
    expect(r.nodes[0].data).toEqual({ label: 'a', iconId: 'x' });
    expect(r.nodes[1].data.fill).toBe('#fff');
    expect(r.edges[0].data).toEqual({ waypoints: [{ x: 1, y: 2 }] });
  });
});

describe('store: bulk actions are single undo steps', () => {
  const s = () => useDiagramStore.getState();
  const load = () => {
    s().reset();
    s().loadDiagram({ nodes: [n('a', 'shape', { fill: '#111111' }, { selected: true }), n('b', 'shape', {}, { selected: true }), n('g', 'group', {}, { selected: true }), n('t', 'text', {})], edges: [] });
  };
  it('updateSelectionStyle changes every applicable selected node in ONE history step', () => {
    load();
    const past = s().past.length;
    expect(s().updateSelectionStyle({ fill: '#222222', shadow: true, radius: 2 })).toBe(3);
    expect(s().past.length).toBe(past + 1);
    expect(s().nodes.filter((x) => x.data.fill === '#222222')).toHaveLength(3);
    expect(s().nodes.find((x) => x.id === 't')!.data.fill).toBeUndefined(); // not selected
    s().undo();
    expect(s().nodes.find((x) => x.id === 'a')!.data.fill).toBe('#111111');
    expect(s().nodes.find((x) => x.id === 'g')!.data.fill).toBeUndefined();
  });
  it('nothing applicable -> no history entry', () => {
    s().reset();
    s().loadDiagram({ nodes: [n('j', 'junction', {}, { selected: true })], edges: [] });
    const past = s().past.length;
    expect(s().updateSelectionStyle({ fill: '#fff' })).toBe(0);
    expect(s().past.length).toBe(past);
  });
  it('match size / reset style / select similar via actions', () => {
    s().reset();
    s().loadDiagram({ nodes: [n('a', 'shape', { fill: '#f00' }, { width: 220, height: 110, selected: true }), n('b', 'shape', { fill: '#0f0' }, { selected: true })], edges: [] });
    executeAction('match-size');
    expect(nodeSize(s().nodes[1])).toEqual({ width: 220, height: 110 });
    executeAction('reset-style');
    expect(s().nodes.every((x) => x.data.fill === undefined)).toBe(true);
    s().undo();
    expect(s().nodes[0].data.fill).toBe('#f00');
    useDiagramStore.setState((st) => ({ nodes: st.nodes.map((x, i) => ({ ...x, selected: i === 0 })) }));
    executeAction('select-similar:type');
    expect(s().nodes.filter((x) => x.selected)).toHaveLength(2);
  });
  it('paste style applies to MANY selected nodes in one undo step', () => {
    s().reset();
    s().loadDiagram({ nodes: [n('src', 'shape', { fill: '#abcdef', radius: 9 }, { selected: true }), n('b', 'shape'), n('c', 'shape')], edges: [] });
    s().copyStyle();
    useDiagramStore.setState((st) => ({ nodes: st.nodes.map((x) => ({ ...x, selected: x.id !== 'src' })) }));
    const past = s().past.length;
    s().pasteStyle();
    expect(s().nodes.filter((x) => x.data.fill === '#abcdef')).toHaveLength(3);
    expect(s().past.length).toBe(past + 1);
  });
  it('context menus offer select-similar, match size, reset style', () => {
    const nodes = [n('a', 'shape', {}, { selected: true }), n('b', 'shape', {}, { selected: true })];
    const ids = flattenMenu(getMenuItems({ type: 'selection' }, { nodes, edges: [], hasClipboard: false, hasStyleClip: true, pageCount: 1 })).map((i) => i.id);
    expect(ids).toEqual(expect.arrayContaining(['match-size', 'reset-style', 'paste-style', 'copy-style']));
    const single = flattenMenu(getMenuItems({ type: 'node', id: 'a' }, { nodes: [{ ...nodes[0], data: { label: 'a', iconId: 'redis' } }], edges: [], hasClipboard: false, hasStyleClip: false, pageCount: 1 })).map((i) => i.id);
    expect(single).toEqual(expect.arrayContaining(['select-similar:type', 'select-similar:icon']));
    const edgeIds = flattenMenu(getMenuItems({ type: 'edge', id: '1' }, { nodes: [], edges: [e('1')], hasClipboard: false, hasStyleClip: false, pageCount: 1 })).map((i) => i.id);
    expect(edgeIds).toContain('select-similar:preset');
  });
});

describe('bulk background for groups', () => {
  it('applies to groups (not only boxes); value mirrors the inspector (fillOpacity > 0 = filled)', () => {
    const nodes = [n('g1', 'group'), n('g2', 'group', { fillOpacity: 20 }), n('s', 'shape')];
    const m = computeMixed(nodes, settings);
    expect(m.background).toMatchObject({ applicable: 3, mixed: true });
    expect(computeMixed([n('g1', 'group'), n('g3', 'group')], settings).background).toMatchObject({ applicable: 2, mixed: false, value: 'transparent' });
    expect(computeMixed([n('g2', 'group', { fillOpacity: 20 })], settings).background!.value).toBe('filled');
  });
  it('patches groups through fillOpacity and shapes through background', () => {
    expect(fieldPatch(n('g', 'group'), 'background', 'filled')).toEqual({ fillOpacity: 12 });
    expect(fieldPatch(n('g', 'group', { fillOpacity: 30 }), 'background', 'filled')).toEqual({ fillOpacity: 30 });
    expect(fieldPatch(n('g', 'group', { fillOpacity: 30 }), 'background', 'transparent')).toEqual({ fillOpacity: 0 });
    expect(fieldPatch(n('s', 'shape'), 'background', 'filled')).toEqual({ background: 'filled' });
  });
  it('applyBulk fills groups and shapes together; clusters are skipped', () => {
    const nodes = [n('g', 'group'), n('s', 'shape'), n('c', 'cluster')];
    const { nodes: out, changed } = applyBulk(nodes, ['g', 's', 'c'], { background: 'filled' });
    expect(changed).toBe(2);
    expect(out[0].data.fillOpacity).toBe(12);
    expect(out[1].data.background).toBe('filled');
    expect(out[2].data.fillOpacity).toBeUndefined();
  });
});

describe('bulk label position (edges)', () => {
  it('labelSide is a bulk edge field with mixed detection and defaults to auto', () => {
    const m = computeMixedEdges([e('1'), e('2', { labelSide: 'on' })], settings);
    expect(m.labelSide).toMatchObject({ mixed: true, applicable: 2 });
    expect(computeMixedEdges([e('1'), e('2')], settings).labelSide).toMatchObject({ mixed: false, value: 'auto' });
  });
  it('store: updateEdges applies labelSide to every selected edge', () => {
    const st = useDiagramStore.getState();
    st.loadDiagram({ version: 1, nodes: [n('a', 'shape'), n('b', 'shape')], edges: [{ ...e('e1'), selected: true }, { ...e('e2'), selected: true }, e('e3')] });
    useDiagramStore.getState().updateEdges(['e1', 'e2'], { labelSide: 'left' });
    const es = useDiagramStore.getState().edges;
    expect(es.map((x) => x.data?.labelSide)).toEqual(['left', 'left', undefined]);
  });
});

describe('sticky font size', () => {
  it('a manual font size turns the fit-to-note mode off; other fields keep it', () => {
    const sticky = { ...n('k', 'sticky'), data: { label: 'k', autoFont: true, fontSize: 18 } } as DiagramNode;
    const a = applyBulk([sticky], ['k'], { fontSize: 22 }).nodes[0].data;
    expect(a).toMatchObject({ fontSize: 22, autoFont: false });
    const b = applyBulk([sticky], ['k'], { fill: '#ffc9de' }).nodes[0].data;
    expect(b.autoFont).toBe(true);
  });
});

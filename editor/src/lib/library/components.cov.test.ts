import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { createComponent, deleteComponent, detachInstance, emptyLibrary as emptyLibraryFn, instanceOf, instantiate, libraryHasComponents, mainToDef, resetOverrides, setOverride, syncInstances } from './components';

const emptyLibrary = emptyLibraryFn();
let counter = 0;
const gen = (p: string) => `${p}${++counter}`;
const n = (id: string, x: number, y: number, data: Record<string, unknown> = {}, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id, selected: true, ...data }, ...extra }) as DiagramNode;
const e = (id: string, source: string, target: string, extra: Partial<DiagramEdge> = {}): DiagramEdge => ({ id, source, target, ...extra }) as DiagramEdge;

function made() {
  const nodes = [n('a', 0, 0, { subtitle: 's' }), n('b', 200, 0), n('c', 400, 400)];
  const edges = [e('e1', 'a', 'b', { label: 'calls', data: { color: '#f00' } as never }), e('e2', 'b', 'c')];
  const r = createComponent(nodes, edges, ['a', 'b'], 'Pair', emptyLibrary, gen)!;
  return { r, nodes, edges };
}

describe('components library', () => {
  it('createComponent: null for empty ids; builds a def with nodes and edges', () => {
    expect(createComponent([], [], ['ghost'], 'x', emptyLibrary, gen)).toBeNull();
    const { r } = made();
    const def = r.library.components[r.componentId];
    expect(def.rev).toBe(1);
    expect(def.nodes).toHaveLength(2);
    expect(def.edges?.[0].label).toBe('calls');
    expect(def.nodes[0].data.selected).toBeUndefined();
    expect(libraryHasComponents(r.library)).toBe(true);
    expect(libraryHasComponents(emptyLibrary)).toBe(false);
  });
  it('nested children keep parentKey relative to the main group', () => {
    const nodes = [n('p', 0, 0, {}, { type: 'group' } as never), n('k', 10, 10, {}, { parentId: 'p' }), n('q', 300, 0)];
    const r = createComponent(nodes, [], ['p', 'q'], 'Nest', emptyLibrary, gen);
    expect(r).not.toBeNull();
    const def = r!.library.components[r!.componentId];
    expect(def.nodes.some((d) => d.parentKey)).toBe(true);
  });
  it('mainToDef: null for unknown group or component, unchanged lib when identical, bumps rev on change', () => {
    const { r } = made();
    expect(mainToDef(r.nodes, r.edges, 'ghost', r.library)).toBeNull();
    expect(mainToDef(r.nodes, r.edges, r.mainId, emptyLibrary)).toBeNull();
    expect(mainToDef(r.nodes, r.edges, r.mainId, r.library)).toBe(r.library);
    const moved = r.nodes.map((x) => (x.id === 'a' ? { ...x, data: { ...x.data, label: 'Renamed' } } : x));
    const next = mainToDef(moved, r.edges, r.mainId, r.library)!;
    expect(next.components[r.componentId].rev).toBe(2);
    const withFile = { ...r.library, components: { ...r.library.components, [r.componentId]: { ...r.library.components[r.componentId], mainFileId: 'f' } } };
    expect(mainToDef(moved, r.edges, r.mainId, withFile)!.components[r.componentId].mainFileId).toBe('f');
  });
  it('instantiate builds group, children (nested parentKey) and edges; instanceOf walks up', () => {
    const { r } = made();
    const def = r.library.components[r.componentId];
    const inst = instantiate(def, { x: 50, y: 60 }, gen);
    expect(inst.nodes[0].id).toBe(inst.groupId);
    expect(inst.edges).toHaveLength(1);
    expect(inst.edges[0].label).toBe('calls');
    expect(instanceOf(inst.nodes, inst.nodes[1].id)).toBe(def.id);
    expect(instanceOf(inst.nodes, inst.groupId)).toBe(def.id);
    expect(instanceOf(inst.nodes, 'ghost')).toBeNull();
    expect(instanceOf([n('x', 0, 0)], 'x')).toBeNull();
    const cyc = [n('a', 0, 0, {}, { parentId: 'b' }), n('b', 0, 0, {}, { parentId: 'a' })];
    expect(instanceOf(cyc, 'a')).toBeNull();
  });
  it('setOverride: only OVERRIDABLE fields, unknown child, plain nodes; resetOverrides restores', () => {
    const { r } = made();
    const def = r.library.components[r.componentId];
    const inst = instantiate(def, { x: 0, y: 0 }, gen);
    const kid = inst.nodes[1].id;
    expect(setOverride(inst.nodes, 'ghost', { label: 'x' })).toBe(inst.nodes);
    expect(setOverride(inst.nodes, kid, { notAllowed: 1 })).toBe(inst.nodes);
    expect(setOverride([n('plain', 0, 0)], 'plain', { label: 'x' }).length).toBe(1);
    const o1 = setOverride(inst.nodes, kid, { label: 'Over' });
    const o2 = setOverride(o1, kid, { fill: '#fff' });
    expect(o2.find((x) => x.id === kid)!.data.label).toBe('Over');
    expect(o2.find((x) => x.id === inst.groupId)!.data.instance!.overrides).not.toEqual({});
    const reset = resetOverrides(o2, inst.groupId, r.library);
    expect(reset.find((x) => x.id === kid)!.data.label).not.toBe('Over');
    expect(resetOverrides(o2, 'ghost', r.library)).toBe(o2);
    expect(resetOverrides(o2, inst.groupId, emptyLibrary)).toBe(o2);
    expect(resetOverrides([n('plain', 0, 0)], 'plain', r.library).length).toBe(1);
  });
  it('syncInstances: unchanged keeps references; new rev rebuilds keeping overrides and ids; missing def detaches', () => {
    const { r } = made();
    const def = r.library.components[r.componentId];
    const inst = instantiate(def, { x: 0, y: 0 }, gen);
    const kid = inst.nodes[1].id;
    const nodes = setOverride(inst.nodes, kid, { label: 'Keep' });
    const same = syncInstances(nodes, inst.edges, r.library, gen);
    expect(same.nodes).toBe(nodes);
    const bumped = { ...r.library, components: { [def.id]: { ...def, rev: def.rev + 1, nodes: [...def.nodes, { key: 'extra', type: 'icon', x: 5, y: 5, width: 10, height: 10, data: { label: 'new' } }], edges: [] } } };
    const out = syncInstances(nodes, inst.edges, bumped as never, gen);
    expect(out.nodes.length).toBe(nodes.length + 1);
    expect(out.edges).toHaveLength(0);
    expect(out.nodes.some((x) => x.data.label === 'Keep')).toBe(true);
    const gone = syncInstances(nodes, inst.edges, emptyLibrary, gen);
    expect(gone.nodes.find((x) => x.id === inst.groupId)!.data.instance).toBeUndefined();
    const dropped = { ...r.library, components: { [def.id]: { ...def, rev: def.rev + 1, nodes: def.nodes.slice(0, 1) } } };
    expect(syncInstances(nodes, inst.edges, dropped as never).nodes.length).toBeLessThan(nodes.length);
    expect(syncInstances(nodes, inst.edges, bumped as never).nodes.length).toBeGreaterThan(0);
  });
  it('detachInstance strips instance markers; deleteComponent removes the def', () => {
    const { r } = made();
    const def = r.library.components[r.componentId];
    const inst = instantiate(def, { x: 0, y: 0 }, gen);
    const d = detachInstance(inst.nodes, inst.groupId);
    expect(d.find((x) => x.id === inst.groupId)!.data.instance).toBeUndefined();
    expect(d.every((x) => !('instKey' in x.data))).toBe(true);
    expect(deleteComponent(r.library, def.id).components[def.id]).toBeUndefined();
  });
});

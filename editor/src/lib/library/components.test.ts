import { describe, expect, it } from 'vitest';
import type { DiagramEdge, DiagramNode } from '../../types';
import { createComponent, detachInstance, emptyLibrary, instantiate, mainToDef, resetOverrides, setOverride, syncInstances, instanceOf, libraryHasComponents, deleteComponent, nextRev } from './components';

const card = (id: string, label: string, x: number, y: number, extra: Record<string, unknown> = {}): DiagramNode =>
  ({ id, type: 'card', position: { x, y }, width: 120, height: 60, data: { label, fill: '#fff', ...extra } }) as DiagramNode;
let n = 0;
const gen = (p: string) => `${p}_${++n}`;
const scene = () => ({ nodes: [card('a', 'API', 100, 100), card('b', 'DB', 300, 100, { iconId: 'postgres' })], edges: [{ id: 'e1', source: 'a', target: 'b', label: 'sql', data: {} } as DiagramEdge] });

describe('create component from a selection', () => {
  it('stores the selection as a main component group and a library definition', () => {
    const { nodes, edges } = scene();
    const r = createComponent(nodes, edges, ['a', 'b'], 'Service pair', emptyLibrary(), gen)!;
    const main = r.nodes.find((x) => x.id === r.mainId)!;
    expect(main.type).toBe('group');
    expect(main.data.componentMain).toBe(r.componentId);
    expect(r.nodes.filter((x) => x.parentId === main.id)).toHaveLength(2);
    const def = r.library.components[r.componentId];
    expect(def.name).toBe('Service pair');
    expect(def.nodes).toHaveLength(2);
    expect(def.edges).toHaveLength(1);
    expect(def.mainNodeId).toBe(main.id);
    expect(def.nodes.every((x) => x.x >= 0 && x.y >= 0)).toBe(true);
  });
  it('returns null for an empty selection', () => {
    expect(createComponent([], [], [], 'x', emptyLibrary(), gen)).toBeNull();
  });
});

describe('instances', () => {
  const made = () => {
    const { nodes, edges } = scene();
    const r = createComponent(nodes, edges, ['a', 'b'], 'Pair', emptyLibrary(), gen)!;
    return { ...r, edges: r.edges };
  };
  it('instantiate places a group of children linked to the definition, with inner edges', () => {
    const m = made();
    const inst = instantiate(m.library.components[m.componentId], { x: 500, y: 400 }, gen);
    const group = inst.nodes.find((x) => !x.parentId)!;
    expect(group.data.instance).toMatchObject({ componentId: m.componentId, rev: 1, overrides: {} });
    expect(group.position).toEqual({ x: 500, y: 400 });
    const kids = inst.nodes.filter((x) => x.parentId === group.id);
    expect(kids.map((k) => k.data.label).sort()).toEqual(['API', 'DB']);
    expect(kids.every((k) => typeof k.data.instKey === 'string')).toBe(true);
    expect(inst.edges).toHaveLength(1);
    expect(kids.map((k) => k.id)).toContain(inst.edges[0].source);
  });
  it('updating the main component updates every instance (new nodes, removed nodes, changed fields)', () => {
    const m = made();
    const inst = instantiate(m.library.components[m.componentId], { x: 500, y: 400 }, gen);
    let nodes = [...m.nodes, ...inst.nodes];
    const edges = [...m.edges, ...inst.edges];
    // edit the main: rename API, add a cache
    const mainId = m.mainId;
    nodes = nodes.map((x) => (x.parentId === mainId && x.data.label === 'API' ? { ...x, data: { ...x.data, label: 'Gateway', fill: '#abc' } } : x));
    nodes = [...nodes, { ...card('c', 'Cache', 20, 20), parentId: mainId } as DiagramNode];
    const lib = mainToDef(nodes, edges, mainId, m.library)!;
    expect(lib.components[m.componentId].rev).toBe(2);
    const synced = syncInstances(nodes, edges, lib);
    const group = synced.nodes.find((x) => x.data.instance && !x.data.componentMain)!;
    const kids = synced.nodes.filter((x) => x.parentId === group.id);
    expect(kids.map((k) => k.data.label).sort()).toEqual(['Cache', 'DB', 'Gateway']);
    expect(kids.find((k) => k.data.label === 'Gateway')!.data.fill).toBe('#abc');
    expect(group.data.instance!.rev).toBe(2);
    // the main itself is untouched
    expect(synced.nodes.find((x) => x.id === mainId)).toBe(nodes.find((x) => x.id === mainId));
  });
  it('overrides (text, colours, icon) survive a main update; other fields follow the main', () => {
    const m = made();
    const inst = instantiate(m.library.components[m.componentId], { x: 0, y: 0 }, gen);
    const group = inst.nodes.find((x) => !x.parentId)!;
    const api = inst.nodes.find((x) => x.data.label === 'API')!;
    let nodes = [...m.nodes, ...inst.nodes];
    nodes = setOverride(nodes, api.id, { label: 'Orders API', fill: '#f00', iconId: 'nginx' });
    expect(nodes.find((x) => x.id === group.id)!.data.instance!.overrides[api.data.instKey as string]).toEqual({ label: 'Orders API', fill: '#f00', iconId: 'nginx' });
    nodes = nodes.map((x) => (x.parentId === m.mainId && x.data.label === 'API' ? { ...x, data: { ...x.data, stroke: '#00f', label: 'Main renamed' } } : x));
    const lib = mainToDef(nodes, m.edges, m.mainId, m.library)!;
    const out = syncInstances(nodes, [...m.edges, ...inst.edges], lib).nodes;
    const k = out.find((x) => x.id === api.id)!;
    expect(k.data).toMatchObject({ label: 'Orders API', fill: '#f00', iconId: 'nginx', stroke: '#00f' });
  });
  it('non-overridable fields cannot be overridden (geometry, instKey)', () => {
    const m = made();
    const inst = instantiate(m.library.components[m.componentId], { x: 0, y: 0 }, gen);
    const api = inst.nodes.find((x) => x.data.label === 'API')!;
    const out = setOverride([...m.nodes, ...inst.nodes], api.id, { instKey: 'hack', locked: true, label: 'ok' } as never);
    const group = out.find((x) => x.data.instance && !x.data.componentMain)!;
    expect(Object.values(group.data.instance!.overrides)[0]).toEqual({ label: 'ok' });
  });
  it('reset overrides restores the main look for one instance', () => {
    const m = made();
    const inst = instantiate(m.library.components[m.componentId], { x: 0, y: 0 }, gen);
    const group = inst.nodes.find((x) => !x.parentId)!;
    const api = inst.nodes.find((x) => x.data.label === 'API')!;
    let nodes = setOverride([...m.nodes, ...inst.nodes], api.id, { label: 'X' });
    nodes = resetOverrides(nodes, group.id, m.library);
    expect(nodes.find((x) => x.id === api.id)!.data.label).toBe('API');
    expect(nodes.find((x) => x.id === group.id)!.data.instance!.overrides).toEqual({});
  });
  it('detach turns an instance into plain nodes (no instance / instKey data), keeping what you see', () => {
    const m = made();
    const inst = instantiate(m.library.components[m.componentId], { x: 0, y: 0 }, gen);
    const group = inst.nodes.find((x) => !x.parentId)!;
    const api = inst.nodes.find((x) => x.data.label === 'API')!;
    const nodes = setOverride([...m.nodes, ...inst.nodes], api.id, { label: 'Mine' });
    const out = detachInstance(nodes, group.id);
    const g = out.find((x) => x.id === group.id)!;
    expect(g.data.instance).toBeUndefined();
    const k = out.find((x) => x.id === api.id)!;
    expect(k.data.label).toBe('Mine');
    expect(k.data.instKey).toBeUndefined();
    // later main updates no longer touch it
    const lib = mainToDef(nodes.map((x) => (x.parentId === m.mainId && x.data.label === 'API' ? { ...x, data: { ...x.data, label: 'Z' } } : x)), m.edges, m.mainId, m.library)!;
    expect(syncInstances(out, [], lib).nodes.find((x) => x.id === api.id)!.data.label).toBe('Mine');
  });
  it('an instance of a deleted component is detached by sync; instanceOf / libraryHasComponents / deleteComponent / nextRev', () => {
    const m = made();
    const inst = instantiate(m.library.components[m.componentId], { x: 0, y: 0 }, gen);
    const group = inst.nodes.find((x) => !x.parentId)!;
    expect(instanceOf([...inst.nodes], group.id)).toBe(m.componentId);
    expect(libraryHasComponents(m.library)).toBe(true);
    expect(libraryHasComponents(emptyLibrary())).toBe(false);
    const gone = deleteComponent(m.library, m.componentId);
    expect(libraryHasComponents(gone)).toBe(false);
    const out = syncInstances(inst.nodes, inst.edges, gone).nodes;
    expect(out.find((x) => x.id === group.id)!.data.instance).toBeUndefined();
    expect(nextRev(m.library.components[m.componentId])).toBe(2);
  });
  it('sync returns the same arrays when nothing changed', () => {
    const m = made();
    const inst = instantiate(m.library.components[m.componentId], { x: 0, y: 0 }, gen);
    const nodes = [...m.nodes, ...inst.nodes];
    const r = syncInstances(nodes, inst.edges, m.library);
    expect(r.nodes).toBe(nodes);
    expect(r.edges).toBe(inst.edges);
  });
});

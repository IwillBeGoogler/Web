/**
 * Components and instances (pure). The MAIN component is a group in some file (`data.componentMain`); its definition lives in the
 * project library and is shared by every file. An INSTANCE is a group (`data.instance`) whose children carry `instKey` (the key of
 * the definition node) and are rebuilt from the definition whenever its revision changes. Per-instance overrides (text, colours,
 * icon) are stored on the instance and re-applied on every rebuild.
 */
import type { DiagramEdge, DiagramNode } from '../../types';
import { absolutePosition, descendantsOf, nodeSize } from '../graph';
import { groupNodes } from '../grouping';
import { emptyLibraryDoc, type ComponentDef, type ComponentEdgeDef, type ComponentNodeDef, type LibraryDoc } from './types';

export { emptyLibraryDoc as emptyLibrary };
export const OVERRIDABLE = ['label', 'subtitle', 'fill', 'stroke', 'textColor', 'labelColor', 'subtitleColor', 'iconId', 'accent'] as const;

export const libraryHasComponents = (l: LibraryDoc): boolean => Object.keys(l.components).length > 0;
export const nextRev = (d: ComponentDef): number => d.rev + 1;
export function deleteComponent(l: LibraryDoc, id: string): LibraryDoc {
  const { [id]: _d, ...rest } = l.components;
  void _d;
  return { ...l, components: rest };
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);
const isInstanceGroup = (n: DiagramNode): boolean => !!n.data.instance && !n.data.componentMain;

/** the component an instance (or one of its children) belongs to */
export function instanceOf(nodes: DiagramNode[], id: string): string | null {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(id);
  for (let i = 0; cur && i < 20; i++) {
    if (cur.data.instance) return cur.data.instance.componentId;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return null;
}
const instanceGroupOf = (nodes: DiagramNode[], id: string): DiagramNode | null => {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  let cur = byId.get(id);
  for (let i = 0; cur && i < 20; i++) {
    if (isInstanceGroup(cur)) return cur;
    cur = cur.parentId ? byId.get(cur.parentId) : undefined;
  }
  return null;
};

function defFromGroup(nodes: DiagramNode[], edges: DiagramEdge[], group: DiagramNode, base: { id: string; name: string; rev: number }): ComponentDef {
  const kids = descendantsOf(nodes, group.id);
  const ids = new Set(kids.map((k) => k.id));
  const size = nodeSize(group);
  const defNodes: ComponentNodeDef[] = kids.map((k) => {
    const s = nodeSize(k);
    const data: Record<string, unknown> = {};
    for (const [key, v] of Object.entries(k.data)) if (v !== undefined && key !== 'instKey' && key !== 'selected') data[key] = v;
    return { key: k.id, type: k.type ?? 'card', x: k.position.x, y: k.position.y, width: s.width, height: s.height, ...(k.parentId && k.parentId !== group.id ? { parentKey: k.parentId } : {}), data };
  });
  const defEdges: ComponentEdgeDef[] = edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({
    key: e.id, source: e.source, target: e.target, ...(e.data ? { data: JSON.parse(JSON.stringify(e.data)) } : {}), ...(typeof e.label === 'string' ? { label: e.label } : {}),
  }));
  return { id: base.id, name: base.name, rev: base.rev, width: size.width, height: size.height, nodes: defNodes, ...(defEdges.length ? { edges: defEdges } : {}) };
}

/** wrap the selection in a main component group and add its definition to the library */
export function createComponent(nodes: DiagramNode[], edges: DiagramEdge[], ids: string[], name: string, lib: LibraryDoc, gen: (p: string) => string): { nodes: DiagramNode[]; edges: DiagramEdge[]; library: LibraryDoc; componentId: string; mainId: string } | null {
  const componentId = gen('cmp');
  const mainId = gen('main');
  const r = groupNodes(nodes, ids, mainId, 12, 0, 'group', { label: name, variant: 'card', componentMain: componentId });
  if (!r) return null;
  const group = r.nodes.find((n) => n.id === mainId)!;
  const def = { ...defFromGroup(r.nodes, edges, group, { id: componentId, name, rev: 1 }), mainNodeId: mainId };
  return { nodes: r.nodes, edges, library: { ...lib, components: { ...lib.components, [componentId]: def } }, componentId, mainId };
}

/** re-read the definition from the main group after it was edited; bumps the revision only when something changed */
export function mainToDef(nodes: DiagramNode[], edges: DiagramEdge[], mainId: string, lib: LibraryDoc): LibraryDoc | null {
  const group = nodes.find((n) => n.id === mainId);
  const cid = group?.data.componentMain as string | undefined;
  const old = cid ? lib.components[cid] : undefined;
  if (!group || !cid || !old) return null;
  const next = defFromGroup(nodes, edges, group, { id: cid, name: old.name, rev: old.rev });
  const merged = { ...next, ...(old.mainFileId ? { mainFileId: old.mainFileId } : {}), mainNodeId: mainId };
  if (sameJson({ ...old, rev: 0 }, { ...merged, rev: 0 })) return lib;
  return { ...lib, components: { ...lib.components, [cid]: { ...merged, rev: nextRev(old) } } };
}

const childData = (def: ComponentNodeDef, key: string, overrides: Record<string, Record<string, unknown>>): Record<string, unknown> => {
  const base: Record<string, unknown> = { ...def.data, instKey: key };
  delete base.componentMain;
  delete base.instance;
  return { ...base, ...(overrides[key] ?? {}) };
};

/** build the nodes and edges of one instance */
export function instantiate(def: ComponentDef, at: { x: number; y: number }, gen: (p: string) => string): { nodes: DiagramNode[]; edges: DiagramEdge[]; groupId: string } {
  const groupId = gen('inst');
  const group: DiagramNode = {
    id: groupId, type: 'group', position: { ...at }, width: def.width, height: def.height, style: { width: def.width, height: def.height }, selected: true,
    data: { label: def.name, variant: 'card', instance: { componentId: def.id, rev: def.rev, overrides: {} } },
  };
  const idOf = new Map(def.nodes.map((d) => [d.key, gen('n')]));
  const kids = def.nodes.map((d): DiagramNode => ({
    id: idOf.get(d.key)!, type: d.type as DiagramNode['type'], parentId: d.parentKey ? idOf.get(d.parentKey) ?? groupId : groupId,
    position: { x: d.x, y: d.y }, ...(d.width ? { width: d.width, height: d.height } : {}), data: childData(d, d.key, {}) as DiagramNode['data'],
  }));
  const edges = (def.edges ?? []).map((e): DiagramEdge => ({
    id: gen('e'), source: idOf.get(e.source)!, target: idOf.get(e.target)!, ...(typeof e.label === 'string' ? { label: e.label } : {}), data: { ...(e.data ?? {}), instKey: e.key },
  } as DiagramEdge));
  return { nodes: [group, ...kids], edges, groupId };
}

function rebuild(nodes: DiagramNode[], edges: DiagramEdge[], group: DiagramNode, def: ComponentDef, overrides: Record<string, Record<string, unknown>>, gen: (p: string) => string): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const subtree = new Set(descendantsOf(nodes, group.id).map((n) => n.id));
  const existing = new Map(nodes.filter((n) => subtree.has(n.id) && typeof n.data.instKey === 'string').map((n) => [n.data.instKey as string, n]));
  const idOf = new Map<string, string>(def.nodes.map((d) => [d.key, existing.get(d.key)?.id ?? gen('n')]));
  const kept = new Set(idOf.values());
  const built = new Map<string, DiagramNode>();
  for (const d of def.nodes) {
    const prev = existing.get(d.key);
    const node: DiagramNode = {
      ...(prev ?? {}), id: idOf.get(d.key)!, type: d.type as DiagramNode['type'], parentId: d.parentKey ? idOf.get(d.parentKey) ?? group.id : group.id,
      position: { x: d.x, y: d.y }, ...(d.width ? { width: d.width, height: d.height } : {}), data: childData(d, d.key, overrides) as DiagramNode['data'],
    } as DiagramNode;
    built.set(node.id, node);
  }
  const edgeByKey = new Map(edges.filter((e) => subtree.has(e.source) && typeof e.data?.instKey === 'string').map((e) => [e.data!.instKey as string, e]));
  const newEdges = (def.edges ?? []).map((e): DiagramEdge => ({
    ...(edgeByKey.get(e.key) ?? {}), id: edgeByKey.get(e.key)?.id ?? gen('e'), source: idOf.get(e.source)!, target: idOf.get(e.target)!,
    ...(typeof e.label === 'string' ? { label: e.label } : {}), data: { ...(e.data ?? {}), instKey: e.key },
  } as DiagramEdge));
  const oldEdgeIds = new Set([...edgeByKey.values()].map((e) => e.id));
  const outNodes: DiagramNode[] = [];
  let inserted = false;
  for (const n of nodes) {
    if (subtree.has(n.id)) {
      if (!inserted) { outNodes.push(...built.values()); inserted = true; }
      continue;
    }
    outNodes.push(n.id === group.id ? { ...n, width: def.width, height: def.height, style: { ...(n.style ?? {}), width: def.width, height: def.height }, data: { ...n.data, label: def.name, instance: { componentId: def.id, rev: def.rev, overrides } } } : n);
    if (n.id === group.id && !inserted) { outNodes.push(...built.values()); inserted = true; }
  }
  void kept; void absolutePosition;
  return { nodes: outNodes, edges: [...edges.filter((e) => !oldEdgeIds.has(e.id)), ...newEdges] };
}

let counter = 0;
const localGen = (p: string) => `${p}_${Date.now().toString(36)}${(counter++).toString(36)}`;

/** bring every instance in line with the library; the very same arrays come back when nothing needs to change */
export function syncInstances(nodes: DiagramNode[], edges: DiagramEdge[], lib: LibraryDoc, gen: (p: string) => string = localGen): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  let curN = nodes;
  let curE = edges;
  for (const g of nodes.filter(isInstanceGroup)) {
    const inst = g.data.instance!;
    const def = lib.components[inst.componentId];
    if (!def) {
      curN = detachInstance(curN, g.id);
      continue;
    }
    if (inst.rev === def.rev) continue;
    const overrides: Record<string, Record<string, unknown>> = {};
    const keys = new Set(def.nodes.map((d) => d.key));
    for (const [k, o] of Object.entries(inst.overrides)) if (keys.has(k)) overrides[k] = o;
    const r = rebuild(curN, curE, curN.find((n) => n.id === g.id)!, def, overrides, gen);
    curN = r.nodes;
    curE = r.edges;
  }
  return curN === nodes && curE === edges ? { nodes, edges } : { nodes: curN, edges: curE };
}

/** override text / colours / icon of one instance child (only OVERRIDABLE fields are accepted) */
export function setOverride(nodes: DiagramNode[], childId: string, patch: Record<string, unknown>): DiagramNode[] {
  const child = nodes.find((n) => n.id === childId);
  const group = child && instanceGroupOf(nodes, childId);
  const key = child?.data.instKey as string | undefined;
  if (!child || !group || !key) return nodes;
  const clean: Record<string, unknown> = {};
  for (const k of OVERRIDABLE) if (k in patch) clean[k] = patch[k];
  if (!Object.keys(clean).length) return nodes;
  return nodes.map((n) => {
    if (n.id === childId) return { ...n, data: { ...n.data, ...clean } };
    if (n.id === group.id) {
      const inst = n.data.instance!;
      return { ...n, data: { ...n.data, instance: { ...inst, overrides: { ...inst.overrides, [key]: { ...(inst.overrides[key] ?? {}), ...clean } } } } };
    }
    return n;
  });
}

export function resetOverrides(nodes: DiagramNode[], groupId: string, lib: LibraryDoc): DiagramNode[] {
  const g = nodes.find((n) => n.id === groupId);
  const def = g?.data.instance && lib.components[g.data.instance.componentId];
  if (!g || !def) return nodes;
  const byKey = new Map(def.nodes.map((d) => [d.key, d]));
  const kids = new Set(descendantsOf(nodes, groupId).map((n) => n.id));
  return nodes.map((n) => {
    if (n.id === groupId) return { ...n, data: { ...n.data, instance: { ...n.data.instance!, overrides: {} } } };
    const d = kids.has(n.id) && typeof n.data.instKey === 'string' ? byKey.get(n.data.instKey) : undefined;
    return d ? { ...n, data: childData(d, d.key, {}) as DiagramNode['data'] } : n;
  });
}

/** make an instance ordinary nodes again (what you see stays) */
export function detachInstance(nodes: DiagramNode[], groupId: string): DiagramNode[] {
  const kids = new Set(descendantsOf(nodes, groupId).map((n) => n.id));
  return nodes.map((n) => {
    if (n.id === groupId) {
      const { instance: _i, ...data } = n.data;
      void _i;
      return { ...n, data };
    }
    if (kids.has(n.id) && 'instKey' in n.data) {
      const { instKey: _k, ...data } = n.data;
      void _k;
      return { ...n, data };
    }
    return n;
  });
}


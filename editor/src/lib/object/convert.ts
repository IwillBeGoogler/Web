import type { Diagram, DiagramEdge, DiagramNode } from '../../types';
import { layeredPlace } from '../autoarrange/layered';
import { umlEdge, umlOf } from '../uml/edges';
import { linkLabel } from '../communication/messages';
import { isObjectNode, objectNode } from './nodes';
import { objectSize } from './sizes';
import type { ObjectData, ObjectModel } from './types';

export { isObjectNode } from './nodes';

/** layered placement of objects (linked objects close together); positions of the boxes, top left */
export function layoutObjects(items: { id: string; w: number; h: number }[], links: [string, string][], gapAlong = 100): Map<string, { x: number; y: number }> {
  return layeredPlace(items, links, { direction: 'LR', gapAcross: 40, gapAlong });
}

export function objectModelToDiagram(model: ObjectModel, origin = { x: 0, y: 0 }): Diagram {
  const ids = new Map(model.objects.map((o, i) => [o.id, `ob${i + 1}`]));
  const nodes: DiagramNode[] = model.objects.map((o, i) => objectNode(`ob${i + 1}`, { x: 0, y: 0 }, o.name, {
    ...(o.className ? { className: o.className } : {}),
    slots: o.slots.map((s, k) => ({ id: `s${k}`, name: s.name, value: s.value })),
  }));
  // links that carry numbered messages need room for their text
  const pos = layoutObjects(nodes.map((n) => ({ id: n.id, w: n.width!, h: n.height! })), model.links.filter((l) => ids.has(l.from) && ids.has(l.to)).map((l) => [ids.get(l.from)!, ids.get(l.to)!]), model.links.some((l) => l.messages?.length) ? 230 : 100);
  const edges: DiagramEdge[] = [];
  let n = 0;
  for (const l of model.links) {
    if (!ids.has(l.from) || !ids.has(l.to)) continue;
    const msgs = (l.messages ?? []).map((m, k) => ({ ...m, id: m.id || `m${n + 1}_${k + 1}` }));
    const label = msgs.length ? linkLabel(msgs) : l.label;
    edges.push(umlEdge(`oe${++n}`, ids.get(l.from)!, ids.get(l.to)!, { kind: 'link', ...(l.srcRole ? { sourceRole: l.srcRole } : {}), ...(l.dstRole ? { targetRole: l.dstRole } : {}), ...(msgs.length ? { messages: msgs } : {}) }, label ? { label } : {}));
  }
  return { version: 1, nodes: nodes.map((x) => ({ ...x, position: { x: (pos.get(x.id)?.x ?? 0) + origin.x, y: (pos.get(x.id)?.y ?? 0) + origin.y } })), edges };
}

export function diagramToObjectModel(nodes: DiagramNode[], edges: DiagramEdge[]): ObjectModel {
  const objs = nodes.filter(isObjectNode);
  const set = new Set(objs.map((n) => n.id));
  const model: ObjectModel = {
    objects: objs.map((n) => {
      const d = n.data as unknown as ObjectData;
      return { id: n.id, name: d.label, ...(d.className ? { className: d.className } : {}), slots: (d.slots ?? []).map((s) => ({ name: s.name, value: s.value })) };
    }),
    links: [],
  };
  for (const e of edges) {
    const u = umlOf(e);
    if (u?.kind !== 'link' || !set.has(e.source) || !set.has(e.target)) continue;
    const msgs = u.messages ?? [];
    model.links.push({ from: e.source, to: e.target, ...(msgs.length ? { messages: msgs } : typeof e.label === 'string' && e.label ? { label: e.label } : {}), ...(u.sourceRole ? { srcRole: u.sourceRole } : {}), ...(u.targetRole ? { dstRole: u.targetRole } : {}) });
  }
  return model;
}

/** Auto-layout the objects of the page (linked objects side by side). Null when there is none. */
export function tidyObjects(nodes: DiagramNode[], edges: DiagramEdge[]): { nodes: DiagramNode[]; count: number } | null {
  const objs = nodes.filter((n) => isObjectNode(n) && !n.parentId);
  if (!objs.length) return null;
  const set = new Set(objs.map((n) => n.id));
  const size = (n: DiagramNode) => ({ w: n.width ?? objectSize(n.data).width, h: n.height ?? objectSize(n.data).height });
  const pos = layoutObjects(objs.map((n) => ({ id: n.id, ...size(n) })), edges.filter((e) => umlOf(e)?.kind === 'link' && set.has(e.source) && set.has(e.target)).map((e) => [e.source, e.target]), edges.some((e) => umlOf(e)?.messages?.length) ? 230 : 100);
  const ox = Math.min(...objs.map((n) => n.position.x)), oy = Math.min(...objs.map((n) => n.position.y));
  const minX = Math.min(...objs.map((n) => pos.get(n.id)!.x)), minY = Math.min(...objs.map((n) => pos.get(n.id)!.y));
  return { nodes: nodes.map((n) => (set.has(n.id) ? { ...n, position: { x: pos.get(n.id)!.x - minX + ox, y: pos.get(n.id)!.y - minY + oy } } : n)), count: objs.length };
}

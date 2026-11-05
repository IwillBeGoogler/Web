import type { Diagram, DiagramEdge, DiagramNode } from '../../types';
import { umlEdge, umlOf } from '../uml/edges';
import { componentNode, withShapeSize } from '../uml2/nodes';
import type { ComponentData } from '../uml2/types';
import { interfaceLinks, layoutComponents, portsOfDef } from './layout';
import type { CompDef, CompKind, ComponentModel } from './types';

export const isInterfaceNode = (n: DiagramNode | undefined): boolean => n?.type === 'component' && (n.data.compKind === 'provided' || n.data.compKind === 'required');
/** component, deployment node or artifact (not a free-standing interface) */
export const isCompNode = (n: DiagramNode | undefined): boolean => n?.type === 'component' && !isInterfaceNode(n);
const dataOf = (n: DiagramNode) => n.data as unknown as ComponentData;

export function componentModelToDiagram(model: ComponentModel, origin = { x: 0, y: 0 }): Diagram {
  const boxes = layoutComponents(model);
  const ids = new Map<string, string>();
  const depth = (c: CompDef): number => (c.parent ? 1 + depth(model.comps.find((x) => x.id === c.parent) ?? { ...c, parent: undefined }) : 0);
  const order = [...model.comps].sort((a, b) => depth(a) - depth(b));
  order.forEach((c, i) => ids.set(c.id, `cp${i + 1}`));
  const portIdOf = new Map<string, string>(); // `${comp}|provided|name` -> port id
  const nodes: DiagramNode[] = [];
  for (const c of order) {
    const b = boxes.get(c.id) ?? { x: 0, y: 0, w: 150, h: 72 };
    const parent = c.parent && ids.has(c.parent) ? c.parent : undefined;
    const ports = portsOfDef(c);
    for (const p of ports) portIdOf.set(`${c.id}|${p.kind}|${p.name}`, p.id);
    const base = componentNode(ids.get(c.id)!, parent ? { x: b.x, y: b.y } : { x: b.x + origin.x, y: b.y + origin.y }, c.kind, c.name);
    const container = model.comps.some((x) => x.parent === c.id);
    const data: ComponentData = { ...dataOf(base), ...(c.stereotype ? { stereotype: c.stereotype } : {}), ...(ports.length ? { ports } : {}), ...(container ? { container: true } : {}) };
    const sized = withShapeSize({ ...base, data: data as unknown as DiagramNode['data'] });
    nodes.push({
      ...sized,
      ...(container ? { width: b.w, height: b.h, style: { ...(sized.style ?? {}), width: b.w, height: b.h } } : {}),
      ...(parent ? { parentId: ids.get(parent)! } : {}),
    } as DiagramNode);
  }
  const edges: DiagramEdge[] = [];
  let n = 0;
  for (const l of model.links) {
    if (ids.has(l.from) && ids.has(l.to)) edges.push(umlEdge(`ce${++n}`, ids.get(l.from)!, ids.get(l.to)!, { kind: l.kind }, l.label ? { label: l.label } : {}));
  }
  for (const l of interfaceLinks(model)) {
    const sp = portIdOf.get(`${l.from}|required|${l.name}`), tp = portIdOf.get(`${l.to}|provided|${l.name}`);
    edges.push(umlEdge(`ce${++n}`, ids.get(l.from)!, ids.get(l.to)!, { kind: 'assembly', ...(sp ? { sourcePort: sp } : {}), ...(tp ? { targetPort: tp } : {}) }));
  }
  return { version: 1, nodes, edges };
}

export function diagramToComponentModel(nodes: DiagramNode[], edges: DiagramEdge[]): ComponentModel {
  const comps = nodes.filter(isCompNode);
  const set = new Set(comps.map((n) => n.id));
  const defs = new Map<string, CompDef>(comps.map((n) => {
    const d = dataOf(n);
    return [n.id, {
      id: n.id, name: d.label, kind: d.compKind as CompKind,
      ...(d.stereotype ? { stereotype: d.stereotype } : {}),
      ...(n.parentId && set.has(n.parentId) ? { parent: n.parentId } : {}),
      provides: (d.ports ?? []).filter((p) => p.kind === 'provided').map((p) => p.name),
      requires: (d.ports ?? []).filter((p) => p.kind === 'required').map((p) => p.name),
    }];
  }));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const links: ComponentModel['links'] = [];
  for (const e of edges) {
    const u = umlOf(e);
    if (!u || (u.kind !== 'dependency' && u.kind !== 'assembly')) continue;
    const label = typeof e.label === 'string' && e.label ? e.label : undefined;
    const s = byId.get(e.source), t = byId.get(e.target);
    if (set.has(e.source) && set.has(e.target)) {
      const sp = u.sourcePort ? dataOf(s!).ports?.find((p) => p.id === u.sourcePort) : undefined;
      const tp = u.targetPort ? dataOf(t!).ports?.find((p) => p.id === u.targetPort) : undefined;
      // an assembly between a required and a provided port of the same interface is implied by the ports
      if (sp && tp && sp.kind === 'required' && tp.kind === 'provided' && sp.name === tp.name) continue;
      links.push({ from: e.source, to: e.target, kind: u.kind, ...(label ? { label } : {}) });
      continue;
    }
    // old style: a free-standing lollipop / socket node joined to a component
    const [comp, iface] = set.has(e.source) && isInterfaceNode(t) ? [e.source, t!] : set.has(e.target) && isInterfaceNode(s) ? [e.target, s!] : [undefined, undefined];
    if (comp && iface) {
      const def = defs.get(comp)!;
      const list = dataOf(iface).compKind === 'provided' ? def.provides : def.requires;
      if (!list.includes(dataOf(iface).label)) list.push(dataOf(iface).label);
    }
  }
  return { comps: [...defs.values()], links };
}

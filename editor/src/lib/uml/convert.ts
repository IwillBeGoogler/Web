import type { Diagram, DiagramEdge, DiagramNode } from '../../types';
import { nodeSize } from '../graph';
import { umlEdge, umlOf } from './edges';
import { blankClass, classOf, withClassSize } from './geometry';
import { layoutClasses } from './layout';
import { baseName, type MemberDef, type UmlClassDef, type UmlModel, type UmlRelDef } from './model';
import type { ClassMember, ClassNodeData, UmlRelationData } from './types';

export interface ToDiagramOptions {
  layout?: boolean;
  origin?: { x: number; y: number };
  /** id prefix, so inserted pages never collide */
  prefix?: string;
}

const withIds = (defs: MemberDef[], p: 'a' | 'o'): ClassMember[] => defs.map((m, i) => ({ ...m, id: `${p}${i}`, ...(p === 'o' && !m.params ? { params: [] } : {}) }));

function classNode(id: string, c: UmlClassDef): DiagramNode {
  const base = blankClass(id, { x: 0, y: 0 }, c.kind, c.name);
  const data: ClassNodeData = {
    ...classOf(base),
    label: c.name,
    kind: c.kind,
    ...(c.generics ? { generics: c.generics } : {}),
    ...(c.stereotype ? { stereotype: c.stereotype } : {}),
    ...(c.package ? { package: c.package } : {}),
    attributes: withIds(c.attributes, 'a'),
    operations: withIds(c.operations, 'o'),
  };
  return withClassSize({ ...base, data: data as unknown as DiagramNode['data'] });
}

const PKG_PAD = 24;
const PKG_TAB = 8;

/** UML model -> class nodes + relation edges, laid out (parents above children); packages become tabbed group nodes when their classes can be boxed cleanly. */
export function modelToDiagram(m: UmlModel, opts: ToDiagramOptions = {}): Diagram {
  const pre = opts.prefix ?? '';
  const nodes: DiagramNode[] = m.classes.map((c, i) => classNode(`${pre}cls_${i}`, c));
  const idOf = new Map(m.classes.map((c, i) => [c.name, nodes[i].id]));
  const edges: DiagramEdge[] = [];
  m.relations.forEach((r: UmlRelDef) => {
    const s = idOf.get(r.from);
    const t = idOf.get(r.to);
    if (!s || !t) return;
    // an association created from a typed attribute attaches at that attribute's row
    const srcDef = m.classes.find((c) => c.name === r.from);
    const attrIdx = r.kind === 'association' && r.toRole ? (srcDef?.attributes.findIndex((a) => a.name === r.toRole && (a.type ?? '').match(/[A-Za-z_]\w*/g)?.includes(baseName(r.to))) ?? -1) : -1;
    const uml: UmlRelationData = {
      kind: r.kind,
      ...(attrIdx >= 0 ? { sourceMember: `a${attrIdx}` } : {}),
      ...(r.directed ? { directed: true } : {}),
      ...(r.fromMult ? { sourceMult: r.fromMult } : {}),
      ...(r.toMult ? { targetMult: r.toMult } : {}),
      ...(r.fromRole ? { sourceRole: r.fromRole } : {}),
      ...(r.toRole ? { targetRole: r.toRole } : {}),
    };
    edges.push(umlEdge(`${pre}rel_${edges.length}`, s, t, uml, r.label ? { label: r.label } : {}));
  });
  if (opts.layout !== false) {
    const pos = layoutClasses(nodes, edges, { origin: opts.origin });
    for (const n of nodes) n.position = pos.get(n.id) ?? n.position;
  }
  const out = opts.layout === false ? nodes : groupPackages(nodes, m, pre);
  return { version: 1, nodes: out, edges };
}

/** Wrap the classes of each package in a package group, when its box would not swallow a class of another package. */
function groupPackages(nodes: DiagramNode[], m: UmlModel, pre: string): DiagramNode[] {
  const pkgs = [...new Set(m.classes.map((c) => c.package).filter((p): p is string => !!p))];
  if (!pkgs.length) return nodes;
  const byClass = new Map(m.classes.map((c, i) => [nodes[i].id, c]));
  const boxes: { name: string; ids: string[]; x: number; y: number; w: number; h: number }[] = [];
  for (const name of pkgs) {
    const members = nodes.filter((n) => byClass.get(n.id)?.package === name);
    if (!members.length) continue;
    const rs = members.map((n) => ({ ...n.position, ...nodeSize(n) }));
    const x = Math.min(...rs.map((r) => r.x)) - PKG_PAD;
    const y = Math.min(...rs.map((r) => r.y)) - PKG_PAD - PKG_TAB;
    boxes.push({ name, ids: members.map((n) => n.id), x, y, w: Math.max(...rs.map((r) => r.x + r.width)) + PKG_PAD - x, h: Math.max(...rs.map((r) => r.y + r.height)) + PKG_PAD - y });
  }
  const hit = (b: { x: number; y: number; w: number; h: number }, r: { x: number; y: number; width: number; height: number }) => b.x < r.x + r.width && r.x < b.x + b.w && b.y < r.y + r.height && r.y < b.y + b.h;
  const ok = boxes.filter((b) => {
    if (nodes.some((n) => !b.ids.includes(n.id) && hit(b, { ...n.position, ...nodeSize(n) }))) return false;
    return !boxes.some((o) => o !== b && hit(b, { x: o.x, y: o.y, width: o.w, height: o.h }));
  });
  if (!ok.length) return nodes;
  const groups: DiagramNode[] = ok.map((b, i) => ({
    id: `${pre}pkg_${i}`, type: 'group', position: { x: b.x, y: b.y }, width: b.w, height: b.h, style: { width: b.w, height: b.h },
    data: { label: b.name, variant: 'package', stroke: '#4b5563', accent: '#4b5563', fillOpacity: 0, border: true, strokeWidth: 1.5, strokeStyle: 'solid' },
  } as DiagramNode));
  const owner = new Map<string, { gid: string; x: number; y: number }>();
  ok.forEach((b, i) => b.ids.forEach((id) => owner.set(id, { gid: groups[i].id, x: b.x, y: b.y })));
  const moved = nodes.map((n) => {
    const o = owner.get(n.id);
    return o ? { ...n, parentId: o.gid, position: { x: n.position.x - o.x, y: n.position.y - o.y } } : n;
  });
  return [...groups, ...moved];
}

const memberDef = (m: ClassMember): MemberDef => {
  const { id: _id, ...rest } = m;
  void _id;
  return { ...rest };
};

/** Class nodes and UML edges of a page -> model (for exports and round trips). */
export function diagramToModel(nodes: DiagramNode[], edges: DiagramEdge[]): UmlModel {
  const groupName = new Map(nodes.filter((n) => n.type === 'group' && n.data.variant === 'package').map((n) => [n.id, n.data.label as string]));
  const cls = nodes.filter((n) => n.type === 'class');
  const model: UmlModel = { classes: [], relations: [] };
  const nameOf = new Map<string, string>();
  for (const n of cls) {
    const d = classOf(n);
    nameOf.set(n.id, d.label);
    const pkg = d.package ?? (n.parentId ? groupName.get(n.parentId) : undefined);
    model.classes.push({
      name: d.label, kind: d.kind,
      ...(d.generics ? { generics: d.generics } : {}),
      ...(d.stereotype ? { stereotype: d.stereotype } : {}),
      ...(pkg ? { package: pkg } : {}),
      attributes: d.attributes.map(memberDef),
      operations: d.operations.map(memberDef),
    });
  }
  for (const e of edges) {
    const u = umlOf(e);
    const a = nameOf.get(e.source);
    const b = nameOf.get(e.target);
    if (!u || u.kind === 'note' || !a || !b) continue;
    model.relations.push({
      from: a, to: b, kind: u.kind,
      ...(u.directed ? { directed: true } : {}),
      ...(u.sourceMult ? { fromMult: u.sourceMult } : {}),
      ...(u.targetMult ? { toMult: u.targetMult } : {}),
      ...(u.sourceRole ? { fromRole: u.sourceRole } : {}),
      ...(u.targetRole ? { toRole: u.targetRole } : {}),
      ...(typeof e.label === 'string' && e.label ? { label: e.label } : {}),
    });
  }
  return model;
}


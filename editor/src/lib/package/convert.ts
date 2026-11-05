import type { Diagram, DiagramEdge, DiagramNode } from '../../types';
import { blankClass, classOf, withClassSize } from '../uml/geometry';
import { parseMember } from '../uml/member';
import { umlEdge, umlOf } from '../uml/edges';
import { layoutPackages, type PkgItem } from './layout';
import { isPackageNode, packageNode } from './nodes';
import { PACKAGE_LINK_KINDS, type PackageLinkKind, type PackageModel, type PkgClassDef, type PkgDef } from './types';

export { isPackageNode } from './nodes';
const isLinkKind = (k: unknown): k is PackageLinkKind => (PACKAGE_LINK_KINDS as readonly unknown[]).includes(k);

/** the nodes the package view works on: package groups and the class nodes (any depth) */
export const isPackageViewNode = (n: DiagramNode): boolean => isPackageNode(n) || n.type === 'class';

export function packageModelToDiagram(model: PackageModel, origin = { x: 0, y: 0 }): Diagram {
  const withIds = (ms: ReturnType<typeof parseMember>[], p: string) => ms.map((m, i) => ({ ...m, id: `${p}${i}` }));
  const classNodes = new Map(model.classes.map((c) => {
    const base = blankClass(c.id, { x: 0, y: 0 }, c.kind, c.name);
    const data = { ...base.data, ...(c.attributes ? { attributes: withIds(c.attributes.map((t) => parseMember(t, 'attribute')), 'a') } : {}), ...(c.operations ? { operations: withIds(c.operations.map((t) => parseMember(t, 'operation')), 'o') } : {}) };
    return [c.id, withClassSize({ ...base, data })] as const;
  }));
  const ids = new Map<string, string>();
  const all: { id: string; parent?: string }[] = [...model.packages, ...model.classes];
  const depth = (c: { id: string; parent?: string }): number => (c.parent ? 1 + depth(all.find((x) => x.id === c.parent) ?? { id: c.id }) : 0);
  const order = [...all].sort((a, b) => depth(a) - depth(b));
  order.forEach((c, i) => ids.set(c.id, model.packages.some((p) => p.id === c.id) ? `pk${i + 1}` : `cls${i + 1}`));
  const items: PkgItem[] = all.map((c) => { const n = classNodes.get(c.id); return { id: c.id, parent: c.parent, w: n?.width ?? 160, h: n?.height ?? 80 }; });
  const boxes = layoutPackages(items, model.links.map((l) => [l.from, l.to]));
  const nodes: DiagramNode[] = [];
  for (const c of order) {
    const b = boxes.get(c.id) ?? { x: 0, y: 0, w: 160, h: 80 };
    const parent = c.parent && ids.has(c.parent) ? ids.get(c.parent)! : undefined;
    const pos = parent ? { x: b.x, y: b.y } : { x: b.x + origin.x, y: b.y + origin.y };
    const cn = classNodes.get(c.id);
    const base = cn
      ? { ...cn, id: ids.get(c.id)!, position: pos }
      : packageNode(ids.get(c.id)!, pos, model.packages.find((p) => p.id === c.id)?.name ?? c.id, b.w, b.h);
    const pk = model.packages.find((p) => p.id === c.parent);
    nodes.push({
      ...base,
      ...(cn && pk ? { data: { ...cn.data, package: pk.name } } : {}),
      ...(!cn ? { width: b.w, height: b.h, style: { width: b.w, height: b.h } } : {}),
      ...(parent ? { parentId: parent } : {}),
    } as DiagramNode);
  }
  const edges: DiagramEdge[] = [];
  let n = 0;
  for (const l of model.links) {
    if (ids.has(l.from) && ids.has(l.to)) edges.push(umlEdge(`pe${++n}`, ids.get(l.from)!, ids.get(l.to)!, { kind: l.kind }, l.label ? { label: l.label } : {}));
  }
  return { version: 1, nodes, edges };
}

export function diagramToPackageModel(nodes: DiagramNode[], edges: DiagramEdge[]): PackageModel {
  const pkgs = nodes.filter(isPackageNode);
  const classes = nodes.filter((n) => n.type === 'class');
  const set = new Set([...pkgs, ...classes].map((n) => n.id));
  const parent = (n: DiagramNode) => (n.parentId && set.has(n.parentId) ? { parent: n.parentId } : {});
  const packages: PkgDef[] = pkgs.map((n) => ({ id: n.id, name: String(n.data.label ?? ''), ...parent(n) }));
  const cls: PkgClassDef[] = classes.map((n) => ({ id: n.id, name: classOf(n).label, kind: classOf(n).kind, ...parent(n) }));
  const links: PackageModel['links'] = [];
  const pkgSet = new Set(pkgs.map((n) => n.id));
  for (const e of edges) {
    const k = umlOf(e)?.kind;
    if (!isLinkKind(k) || !set.has(e.source) || !set.has(e.target)) continue;
    // import / access / merge only join packages; a dependency may join classes too
    if (k !== 'dependency' && !(pkgSet.has(e.source) && pkgSet.has(e.target))) continue;
    const label = typeof e.label === 'string' && e.label && e.label !== `«${k}»` ? e.label : undefined;
    links.push({ from: e.source, to: e.target, kind: k, ...(label ? { label } : {}) });
  }
  return { packages, classes: cls, links };
}

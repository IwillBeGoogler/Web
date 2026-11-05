import type { DiagramEdge, DiagramNode } from '../../types';
import { diagramToPackageModel } from './convert';
import { layoutPackages, PKG_PAD } from './layout';
import { isPackageNode, packageNode } from './nodes';
import { sortParentsFirst } from '../graph';

/**
 * Auto-layout the package diagram: packages and classes are placed in layers, dependents above what they depend on (links between
 * classes in different packages count between their packages); a package is sized around its content. Null when there is none.
 */
export function tidyPackages(nodes: DiagramNode[], edges: DiagramEdge[]): { nodes: DiagramNode[]; count: number } | null {
  const model = diagramToPackageModel(nodes, edges);
  const items = [...model.packages, ...model.classes];
  if (!model.packages.length) return null;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const hasKids = new Set(items.filter((c) => c.parent).map((c) => c.parent!));
  const boxes = layoutPackages(
    items.map((c) => { const n = byId.get(c.id); return { id: c.id, parent: c.parent, w: n?.width ?? 200, h: n?.height ?? 120 }; }),
    model.links.map((l) => [l.from, l.to]),
  );
  const inModel = new Set(items.map((c) => c.id));
  const tops = nodes.filter((n) => inModel.has(n.id) && !(n.parentId && inModel.has(n.parentId)));
  const ox = Math.min(...tops.map((n) => n.position.x)), oy = Math.min(...tops.map((n) => n.position.y));
  const next = nodes.map((n) => {
    const b = boxes.get(n.id);
    if (!b || !inModel.has(n.id)) return n;
    const nested = !!(n.parentId && inModel.has(n.parentId));
    const position = nested ? { x: b.x, y: b.y } : { x: b.x + ox, y: b.y + oy };
    if (hasKids.has(n.id)) return { ...n, position, width: b.w, height: b.h, style: { ...(n.style ?? {}), width: b.w, height: b.h } } as DiagramNode;
    return { ...n, position };
  });
  return { nodes: next, count: items.length };
}

/** Put the selected top level packages and classes into a new package (a group the elements are children of). */
export function nestInPackage(nodes: DiagramNode[], ids: string[], packageId: string): DiagramNode[] | null {
  const pick = nodes.filter((n) => ids.includes(n.id) && (isPackageNode(n) || n.type === 'class') && !n.parentId);
  if (!pick.length) return null;
  const rect = (n: DiagramNode) => ({ x: n.position.x, y: n.position.y, w: n.width ?? 160, h: n.height ?? 96 });
  const minX = Math.min(...pick.map((n) => rect(n).x)), minY = Math.min(...pick.map((n) => rect(n).y));
  const maxX = Math.max(...pick.map((n) => rect(n).x + rect(n).w)), maxY = Math.max(...pick.map((n) => rect(n).y + rect(n).h));
  const x = minX - PKG_PAD.x, y = minY - PKG_PAD.top, w = maxX - minX + PKG_PAD.x * 2, h = maxY - minY + PKG_PAD.top + PKG_PAD.bottom;
  const box = { ...packageNode(packageId, { x, y }, 'package', w, h), selected: true } as DiagramNode;
  const picked = new Set(pick.map((n) => n.id));
  const moved = nodes.map((n) => (picked.has(n.id) ? { ...n, parentId: packageId, position: { x: n.position.x - x, y: n.position.y - y }, selected: false } : n));
  return sortParentsFirst([...moved, box]);
}

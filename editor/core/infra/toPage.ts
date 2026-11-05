import { resolveIcon } from '../catalog';
import { uniqueId } from '../graph';
import { applyLayout } from '../layout';
import type { CEdge, CNode, CPage } from '../types';
import { iconFor } from './icons';
import type { InfraModel } from './types';
import { slug } from './util';

const GROUP_ICONS: Record<string, string[]> = {
  vpc: ['aws-group-vpc'], subnet: ['aws-group-private-subnet'], 'subnet-public': ['aws-group-public-subnet'], namespace: ['k8s-group-namespace'], network: [], module: [],
};

/** the model as a page: groups nested, catalog icons, labelled edges, laid out left to right */
export function infraToPage(model: InfraModel, opts: { name?: string; id?: string } = {}): CPage {
  const taken = new Set<string>();
  const idOf = new Map<string, string>();
  const nodes: CNode[] = [];
  // groups first so that parents precede children
  const order = [...model.resources].sort((a, b) => Number(!!b.group) - Number(!!a.group));
  for (const r of order) idOf.set(r.id, uniqueId(slug(r.id), taken));
  const depth = (id: string, n = 0): number => { const g = model.resources.find((x) => x.id === id)?.groupOf; return g && n < 16 ? 1 + depth(g, n + 1) : 0; };
  for (const r of [...order].sort((a, b) => depth(a.id) - depth(b.id))) {
    const node: CNode = { id: idOf.get(r.id)!, type: r.group ? 'group' : 'icon', position: { x: 0, y: 0 }, data: { label: r.name } };
    if (r.subtitle && !r.group) node.data.subtitle = r.subtitle;
    if (r.group) {
      const icon = (GROUP_ICONS[r.groupKind ?? ''] ?? []).find((i) => resolveIcon(i));
      if (icon) node.data.groupIcon = icon;
      node.width = 360;
      node.height = 240;
    } else node.data.iconId = iconFor(r);
    if (r.groupOf && idOf.has(r.groupOf)) node.parentId = idOf.get(r.groupOf);
    nodes.push(node);
  }
  const edgeIds = new Set<string>();
  const edges: CEdge[] = model.edges.map((e) => ({
    id: uniqueId(`e-${idOf.get(e.from)}-${idOf.get(e.to)}`, edgeIds),
    source: idOf.get(e.from)!,
    target: idOf.get(e.to)!,
    ...(e.label ? { label: e.label } : {}),
  })).map((e) => (edgeIds.add(e.id), e));
  const page: CPage = { id: opts.id ?? 'page-1', name: opts.name ?? 'Imported infrastructure', nodes, edges };
  applyLayout(page, 'layered');
  return page;
}

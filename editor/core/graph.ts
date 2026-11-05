import { resolveIcon } from './catalog';
import { DEFAULT_SIZE, nodeSize, type CEdge, type CNode, type CPage } from './types';

export interface NodeSpec {
  id?: string;
  label: string;
  /** catalog id, label or alias (see searchCatalog) */
  icon?: string;
  /** node type when no icon decides it: icon (default), group, text, shape, sticky, card */
  type?: string;
  subtitle?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** id of an existing group node; x / y are then relative to it */
  parent?: string;
  data?: Record<string, unknown>;
}
export interface EdgeSpec { id?: string; source: string; target: string; label?: string; preset?: string; dashed?: boolean; data?: Record<string, unknown> }
export interface ItemError { index: number; message: string }

export const slugId = (s: string, fallback = 'node'): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || fallback;

/** `base`, `base-2`, `base-3` ... first one not in `taken` */
export function uniqueId(base: string, taken: { has(id: string): boolean }): string {
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

const GAP = 60;
const COLS = 5;
/** where the next auto-placed top-level node goes: a row under everything, five per row, deterministic */
function autoOrigin(page: CPage): { x: number; y: number } {
  const top = page.nodes.filter((n) => !n.parentId);
  return { x: top.length ? Math.min(...top.map((n) => n.position.x)) : 0, y: top.length ? Math.max(...top.map((n) => n.position.y + nodeSize(n).height)) + GAP : 0 };
}
const autoSpot = (o: { x: number; y: number }, i: number) => ({ x: o.x + (i % COLS) * (DEFAULT_SIZE.width + GAP), y: o.y + Math.floor(i / COLS) * (DEFAULT_SIZE.height + GAP) });

export function addNodes(page: CPage, specs: NodeSpec[]): { added: CNode[]; errors: ItemError[] } {
  const added: CNode[] = [];
  const errors: ItemError[] = [];
  const taken = new Set(page.nodes.map((n) => n.id));
  let placed = 0;
  let auto = 0;
  const origin = autoOrigin(page);
  specs.forEach((s, index) => {
    const label = String(s.label ?? '').trim();
    if (!label) return void errors.push({ index, message: 'label is required' });
    if (s.id && taken.has(s.id)) return void errors.push({ index, message: `node id "${s.id}" already exists` });
    if (s.parent && !page.nodes.some((n) => n.id === s.parent && (n.type === 'group' || n.type === 'cluster'))) return void errors.push({ index, message: `parent "${s.parent}" is not a group on this page` });
    let type = s.type ?? 'icon';
    const data: CNode['data'] = { ...(s.data ?? {}), label };
    if (s.subtitle) data.subtitle = s.subtitle;
    if (s.icon) {
      const hit = resolveIcon(s.icon);
      if (!hit) return void errors.push({ index, message: `unknown icon "${s.icon}" (use search_catalog)` });
      if (hit.kind === 'cluster') return void errors.push({ index, message: `"${s.icon}" is a cluster profile; add its member icons instead` });
      if (hit.kind === 'group') {
        type = 'group';
        data.groupIcon = hit.id;
      } else data.iconId = hit.id;
    }
    const id = s.id ?? uniqueId(slugId(label), taken);
    taken.add(id);
    const hasPos = typeof s.x === 'number' && typeof s.y === 'number';
    const pos = hasPos ? { x: s.x!, y: s.y! } : s.parent ? { x: 24 + (placed % 3) * 150, y: 60 + Math.floor(placed / 3) * 120 } : autoSpot(origin, auto++);
    const node: CNode = { id, type, position: pos, data };
    const w = s.width ?? (type === 'group' ? 360 : undefined);
    const h = s.height ?? (type === 'group' ? 240 : undefined);
    if (w) node.width = w;
    if (h) node.height = h;
    if (s.parent) node.parentId = s.parent;
    placed++;
    page.nodes.push(node);
    added.push(node);
  });
  return { added, errors };
}

export function addEdges(page: CPage, specs: EdgeSpec[]): { added: CEdge[]; errors: ItemError[] } {
  const added: CEdge[] = [];
  const errors: ItemError[] = [];
  const ids = new Set(page.nodes.map((n) => n.id));
  const taken = new Set(page.edges.map((e) => e.id));
  specs.forEach((s, index) => {
    for (const end of [s.source, s.target]) if (!ids.has(end)) return void errors.push({ index, message: `node "${end}" not found` });
    if (s.id && taken.has(s.id)) return void errors.push({ index, message: `edge id "${s.id}" already exists` });
    if (!ids.has(s.source) || !ids.has(s.target)) return;
    const id = s.id ?? uniqueId(`e-${s.source}-${s.target}`, taken);
    taken.add(id);
    const data: Record<string, unknown> = { ...(s.data ?? {}) };
    if (s.preset) data.preset = s.preset;
    if (s.dashed) data.dashed = true;
    const edge: CEdge = { id, source: s.source, target: s.target, ...(s.label ? { label: s.label } : {}), ...(Object.keys(data).length ? { data } : {}) };
    page.edges.push(edge);
    added.push(edge);
  });
  return { added, errors };
}

export interface NodePatch { label?: string; subtitle?: string; icon?: string; x?: number; y?: number; width?: number; height?: number; data?: Record<string, unknown> }
export function updateNode(page: CPage, id: string, patch: NodePatch): CNode {
  const n = page.nodes.find((x) => x.id === id);
  if (!n) throw new Error(`node "${id}" not found`);
  if (patch.icon !== undefined) {
    const hit = resolveIcon(patch.icon);
    if (!hit || hit.kind === 'cluster') throw new Error(`unknown icon "${patch.icon}"`);
    if (hit.kind === 'group') n.data.groupIcon = hit.id;
    else n.data.iconId = hit.id;
  }
  if (patch.data) Object.assign(n.data, patch.data);
  if (patch.label !== undefined) n.data.label = patch.label;
  if (patch.subtitle !== undefined) n.data.subtitle = patch.subtitle;
  if (patch.x !== undefined || patch.y !== undefined) n.position = { x: patch.x ?? n.position.x, y: patch.y ?? n.position.y };
  if (patch.width !== undefined) n.width = patch.width;
  if (patch.height !== undefined) n.height = patch.height;
  return n;
}

/** delete nodes (with their descendants and every attached edge) and edges by id */
export function deleteElements(page: CPage, ids: string[]): { nodes: number; edges: number } {
  const kill = new Set(ids.filter((id) => page.nodes.some((n) => n.id === id)));
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of page.nodes) if (n.parentId && kill.has(n.parentId) && !kill.has(n.id)) (kill.add(n.id), (grew = true));
  }
  const edgeKill = new Set(ids.filter((id) => page.edges.some((e) => e.id === id)));
  const nBefore = page.nodes.length;
  const eBefore = page.edges.length;
  page.nodes = page.nodes.filter((n) => !kill.has(n.id));
  page.edges = page.edges.filter((e) => !edgeKill.has(e.id) && !kill.has(e.source) && !kill.has(e.target));
  return { nodes: nBefore - page.nodes.length, edges: eBefore - page.edges.length };
}

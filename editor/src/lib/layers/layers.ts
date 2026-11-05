/**
 * Layers panel model: the node tree of ONE file (pure).
 *
 * Parents: `parentId` (groups, clusters), else the smallest Board frame that contains the node's centre, plus read-only rows for
 * the participants of a sequence diagram. Rows are listed top-most layer first (the opposite of the array / paint order).
 */
import type { DiagramEdge, DiagramNode } from '../../types';
import { absolutePosition, canNest, descendantsOf, isContainer, nodeSize, sortParentsFirst } from '../graph';

export interface LayerRow {
  id: string;
  parentId?: string;
  depth: number;
  label: string;
  type: string;
  hasChildren: boolean;
  /** a row that is not a node of its own (sequence participant): cannot be renamed, moved or hidden */
  virtual?: boolean;
  hidden: boolean;
  locked: boolean;
  effectiveHidden: boolean;
  effectiveLocked: boolean;
}

const isFrame = (n: DiagramNode) => n.type === 'frame';

/** the layer parent of every node: real parent, else the smallest frame whose rect holds the node centre */
function layerParents(nodes: DiagramNode[]): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  const frames = nodes.filter(isFrame).map((f) => ({ id: f.id, ...f.position, ...nodeSize(f) }));
  for (const nd of nodes) {
    if (nd.parentId && nodes.some((p) => p.id === nd.parentId)) {
      out.set(nd.id, nd.parentId);
      continue;
    }
    if (isFrame(nd)) {
      out.set(nd.id, undefined);
      continue;
    }
    const s = nodeSize(nd);
    const cx = nd.position.x + s.width / 2;
    const cy = nd.position.y + s.height / 2;
    let best: { id: string; area: number } | undefined;
    for (const f of frames) {
      if (cx < f.x || cx > f.x + f.width || cy < f.y || cy > f.y + f.height) continue;
      const area = f.width * f.height;
      if (!best || area < best.area) best = { id: f.id, area };
    }
    out.set(nd.id, best?.id);
  }
  return out;
}

interface SeqParticipant { id: string; name: string }
const participantsOf = (n: DiagramNode): SeqParticipant[] =>
  n.type === 'sequence' && Array.isArray(n.data.participants) ? (n.data.participants as SeqParticipant[]).filter((p) => p && typeof p.id === 'string') : [];

/** ids that are hidden themselves or through a hidden ancestor / enclosing frame */
export function effectiveHiddenIds(nodes: DiagramNode[]): Set<string> {
  return flagged(nodes, 'hidden');
}
function flagged(nodes: DiagramNode[], flag: 'hidden' | 'locked'): Set<string> {
  const parents = layerParents(nodes);
  const byId = new Map(nodes.map((x) => [x.id, x]));
  const memo = new Map<string, boolean>();
  const test = (id: string, depth = 0): boolean => {
    if (memo.has(id)) return memo.get(id)!;
    const nd = byId.get(id);
    let v = !!nd?.data[flag];
    const p = parents.get(id);
    if (!v && p && depth < 50) v = test(p, depth + 1);
    memo.set(id, v);
    return v;
  };
  return new Set(nodes.filter((x) => test(x.id)).map((x) => x.id));
}

export interface BuildOptions {
  expanded: Set<string>;
  /** list every row regardless of `expanded` (the filter wants all of them) */
  all?: boolean;
}

export function buildLayerRows(nodes: DiagramNode[], opts: BuildOptions): LayerRow[] {
  const parents = layerParents(nodes);
  const hid = flagged(nodes, 'hidden');
  const lock = flagged(nodes, 'locked');
  const kids = new Map<string | undefined, DiagramNode[]>();
  for (const nd of nodes) {
    const p = parents.get(nd.id);
    const l = kids.get(p) ?? [];
    l.push(nd);
    kids.set(p, l);
  }
  const rows: LayerRow[] = [];
  const visit = (list: DiagramNode[], depth: number, parentId?: string) => {
    for (const nd of [...list].reverse()) {
      const sub = kids.get(nd.id) ?? [];
      const parts = participantsOf(nd);
      const open = opts.all || opts.expanded.has(nd.id);
      rows.push({
        id: nd.id, parentId, depth, label: String(nd.data.label ?? ''), type: nd.type ?? 'icon',
        hasChildren: sub.length > 0 || parts.length > 0,
        hidden: !!nd.data.hidden, locked: !!nd.data.locked, effectiveHidden: hid.has(nd.id), effectiveLocked: lock.has(nd.id),
      });
      if (!open) continue;
      visit(sub, depth + 1, nd.id);
      for (const p of parts)
        rows.push({ id: `${nd.id}#${p.id}`, parentId: nd.id, depth: depth + 1, label: p.name, type: 'participant', hasChildren: false, virtual: true, hidden: false, locked: false, effectiveHidden: hid.has(nd.id), effectiveLocked: true });
    }
  };
  visit(kids.get(undefined) ?? [], 0);
  return rows;
}

/** keep rows that match `query` (label or type) and the ancestors that lead to them */
export function filterRows(rows: LayerRow[], query: string): LayerRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows;
  const byId = new Map(rows.map((r) => [r.id, r]));
  const keep = new Set<string>();
  for (const r of rows) {
    if (!r.label.toLowerCase().includes(q) && !r.type.toLowerCase().includes(q)) continue;
    let cur: LayerRow | undefined = r;
    while (cur && !keep.has(cur.id)) {
      keep.add(cur.id);
      cur = cur.parentId ? byId.get(cur.parentId) : undefined;
    }
  }
  return rows.filter((r) => keep.has(r.id));
}

/**
 * Move a node (with its subtree) to `parentId` (null = root) at sibling index `index` (array / paint order, 0 = bottom-most).
 * The absolute position is kept. null when illegal (cycle, target is not a container, nesting rules).
 */
export function moveLayer(nodes: DiagramNode[], id: string, parentId: string | null, index: number): DiagramNode[] | null {
  const node = nodes.find((x) => x.id === id);
  if (!node) return null;
  if (parentId !== null) {
    if (parentId === id) return null;
    const target = nodes.find((x) => x.id === parentId);
    if (!target || !isContainer(target) || !canNest(nodes, node, parentId)) return null;
  }
  const subtree = [node, ...descendantsOf(nodes, id)];
  const inSub = new Set(subtree.map((x) => x.id));
  const abs = absolutePosition(nodes, node);
  let moved: DiagramNode;
  if ((node.parentId ?? null) === parentId) moved = node;
  else if (parentId === null) {
    const { parentId: _p, ...rest } = node;
    void _p;
    moved = { ...rest, position: abs } as DiagramNode;
  } else {
    const pAbs = absolutePosition(nodes, nodes.find((x) => x.id === parentId)!);
    moved = { ...node, parentId, position: { x: abs.x - pAbs.x, y: abs.y - pAbs.y } };
  }
  const rest = nodes.filter((x) => !inSub.has(x.id));
  const siblings = rest.filter((x) => (x.parentId ?? null) === parentId);
  const block = [moved, ...subtree.slice(1)];
  let at: number;
  if (index >= siblings.length) {
    // after the last sibling's whole subtree (or right after the parent when it has no children yet)
    const last = siblings[siblings.length - 1];
    if (last) {
      const end = new Set([last.id, ...descendantsOf(rest, last.id).map((x) => x.id)]);
      at = Math.max(...rest.map((x, i) => (end.has(x.id) ? i : -1))) + 1;
    } else at = parentId === null ? rest.length : rest.findIndex((x) => x.id === parentId) + 1;
  } else at = rest.findIndex((x) => x.id === siblings[Math.max(0, index)].id);
  const out = [...rest.slice(0, at), ...block, ...rest.slice(at)];
  return sortParentsFirst(out);
}

export function toggleLayerFlag(nodes: DiagramNode[], id: string, flag: 'hidden' | 'locked'): DiagramNode[] {
  return nodes.map((x) => (x.id === id ? { ...x, data: { ...x.data, [flag]: !x.data[flag] } } : x));
}

/** what exporters see: no hidden node (nor anything inside a hidden group / frame) and no edge touching one */
export function exportContent(nodes: DiagramNode[], edges: DiagramEdge[]): { nodes: DiagramNode[]; edges: DiagramEdge[] } {
  const hid = effectiveHiddenIds(nodes);
  if (!hid.size) return { nodes, edges };
  return { nodes: nodes.filter((x) => !hid.has(x.id)), edges: edges.filter((e) => !hid.has(e.source) && !hid.has(e.target)) };
}

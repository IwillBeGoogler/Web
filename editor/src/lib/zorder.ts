import type { DiagramNode } from '../types';

export type ZMode = 'front' | 'back' | 'forward' | 'backward';

function moveWithin<T extends { sel: boolean }>(items: T[], mode: ZMode): T[] {
  if (mode === 'front') return [...items.filter((i) => !i.sel), ...items.filter((i) => i.sel)];
  if (mode === 'back') return [...items.filter((i) => i.sel), ...items.filter((i) => !i.sel)];
  const out = [...items];
  if (mode === 'forward') {
    for (let i = out.length - 2; i >= 0; i--) if (out[i].sel && !out[i + 1].sel) [out[i], out[i + 1]] = [out[i + 1], out[i]];
  } else {
    for (let i = 1; i < out.length; i++) if (out[i].sel && !out[i - 1].sel) [out[i], out[i - 1]] = [out[i - 1], out[i]];
  }
  return out;
}

/**
 * Reorder render order (array order). Siblings (same parent) reorder among themselves;
 * every subtree stays contiguous directly after its parent, at any depth.
 */
export function reorderZ(nodes: DiagramNode[], ids: string[], mode: ZMode): DiagramNode[] {
  const sel = new Set(ids);
  const known = new Set(nodes.map((n) => n.id));
  const children = new Map<string | undefined, DiagramNode[]>();
  for (const n of nodes) {
    const key = n.parentId && known.has(n.parentId) ? n.parentId : undefined;
    const l = children.get(key) ?? [];
    l.push(n);
    children.set(key, l);
  }
  const build = (parent: string | undefined): DiagramNode[] => {
    const items = (children.get(parent) ?? []).map((n) => ({ n, sel: sel.has(n.id) }));
    return moveWithin(items, mode).flatMap((it) => [it.n, ...build(it.n.id)]);
  };
  return build(undefined);
}

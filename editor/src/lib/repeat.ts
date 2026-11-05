import type { DiagramNode } from '../types';
import { descendantsOf, newId, nodeSize, sortParentsFirst } from './graph';

/** "server" -> "server-1"; an existing "-N" suffix is stripped first. */
export const repeatBase = (label: string): string => label.replace(/[-\s]\d+$/, '') || 'group';

/**
 * Turn a group into `count` repeated groups laid out in a row (server-1 ... server-N) with an ellipsis marker before the
 * last one. The original keeps its id and becomes `-1`; clones get fresh ids (children included).
 */
export function repeatGroup(nodes: DiagramNode[], groupId: string, count: number, genId: (p: string) => string = newId): DiagramNode[] {
  const g = nodes.find((n) => n.id === groupId);
  if (!g || count < 2) return nodes;
  const base = repeatBase(g.data.label);
  const kids = descendantsOf(nodes, groupId);
  const { width, height } = nodeSize(g);
  const gap = 40;
  const ellipsisW = 48;
  const origin = g.position; // relative to the shared parent, so siblings line up
  const withEllipsis = count >= 3;
  const added: DiagramNode[] = [];
  let x = origin.x + width + gap;
  for (let i = 2; i <= count; i++) {
    if (withEllipsis && i === count) {
      added.push({ id: genId('n'), type: 'shape', position: { x, y: origin.y + height / 2 - 14 }, width: ellipsisW, height: 28, data: { label: '', shape: 'ellipsis', repeatOf: groupId }, ...(g.parentId ? { parentId: g.parentId } : {}) });
      x += ellipsisW + gap;
    }
    const gid = genId('g');
    const map = new Map<string, string>([[groupId, gid]]);
    for (const k of kids) map.set(k.id, genId('n'));
    const clone = (n: DiagramNode, id: string): DiagramNode => {
      const { selected: _s, ...rest } = structuredClone(n) as DiagramNode;
      void _s;
      return { ...rest, id, ...(n.parentId ? { parentId: map.get(n.parentId) } : {}) };
    };
    added.push({ ...clone(g, gid), position: { x, y: origin.y }, ...(g.parentId ? { parentId: g.parentId } : {}), data: { ...g.data, label: `${base}-${i}`, repeatOf: groupId } });
    for (const k of kids) added.push(clone(k, map.get(k.id)!));
    x += width + gap;
  }
  const renamed = nodes.map((n) => (n.id === groupId ? { ...n, data: { ...n.data, label: `${base}-1` } } : n));
  return sortParentsFirst([...renamed, ...added]);
}

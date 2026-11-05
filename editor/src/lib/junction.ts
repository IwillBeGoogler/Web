import type { DiagramEdge, DiagramNode } from '../types';
import { absolutePosition, newId, nodeIndex, nodeSize } from './graph';
import type { Route } from './routing';

export const JUNCTION_SIZE = 10;
export const isJunction = (n: DiagramNode | undefined): boolean => n?.type === 'junction';

/** Arrowheads never sit at a junction: no end marker into one, no start marker out of one. */
export function junctionEnds(nodes: DiagramNode[], e: DiagramEdge): { noStart: boolean; noEnd: boolean } {
  const byId = nodeIndex(nodes);
  return { noStart: isJunction(byId.get(e.source)), noEnd: isJunction(byId.get(e.target)) };
}

/**
 * Fan-in bus: edges that share a target are merged through a junction placed just before the target. Each source gets
 * source -> junction (no arrow), and one junction -> target edge (with the arrow) carries the shared style and label.
 * Works symmetrically for fan-out when all edges share a source.
 */
export function addJunction(nodes: DiagramNode[], edges: DiagramEdge[], edgeIds: string[], genId: (p: string) => string = newId): { nodes: DiagramNode[]; edges: DiagramEdge[]; junctionId: string } | null {
  const picked = edges.filter((e) => edgeIds.includes(e.id));
  if (picked.length < 2) return null;
  const sameTarget = picked.every((e) => e.target === picked[0].target);
  const sameSource = picked.every((e) => e.source === picked[0].source);
  if (!sameTarget && !sameSource) return null;
  const anchorId = sameTarget ? picked[0].target : picked[0].source;
  const anchor = nodes.find((n) => n.id === anchorId);
  if (!anchor) return null;
  const others = picked.map((e) => nodes.find((n) => n.id === (sameTarget ? e.source : e.target))).filter((n): n is DiagramNode => !!n);
  const ap = absolutePosition(nodes, anchor);
  const as = nodeSize(anchor);
  const centre = (n: DiagramNode) => {
    const p = absolutePosition(nodes, n);
    const s = nodeSize(n);
    return { x: p.x + s.width / 2, y: p.y + s.height / 2 };
  };
  const oc = others.map(centre);
  const avg = { x: oc.reduce((a, c) => a + c.x, 0) / oc.length, y: oc.reduce((a, c) => a + c.y, 0) / oc.length };
  const ac = { x: ap.x + as.width / 2, y: ap.y + as.height / 2 };
  // place on the line between the others' centroid and the anchor, 60px outside the anchor's edge
  const horizontal = Math.abs(avg.x - ac.x) >= Math.abs(avg.y - ac.y);
  const pos = horizontal
    ? { x: avg.x < ac.x ? ap.x - 60 : ap.x + as.width + 60, y: ac.y }
    : { x: ac.x, y: avg.y < ac.y ? ap.y - 60 : ap.y + as.height + 60 };
  const jid = genId('j');
  const junction: DiagramNode = { id: jid, type: 'junction', position: { x: pos.x - JUNCTION_SIZE / 2, y: pos.y - JUNCTION_SIZE / 2 }, width: JUNCTION_SIZE, height: JUNCTION_SIZE, data: { label: '' } };
  const drop = new Set(edgeIds);
  const first = picked[0];
  const shared: DiagramEdge[] = picked.map((e) => ({ ...e, id: genId('e'), ...(sameTarget ? { target: jid, targetHandle: undefined } : { source: jid, sourceHandle: undefined }), label: undefined, data: { ...e.data, endMarker: sameTarget ? 'none' : e.data?.endMarker, startMarker: sameTarget ? e.data?.startMarker : 'none', pinTarget: sameTarget ? undefined : e.data?.pinTarget, pinSource: sameTarget ? e.data?.pinSource : undefined } }));
  const trunk: DiagramEdge = {
    ...first,
    id: genId('e'),
    ...(sameTarget ? { source: jid, sourceHandle: undefined } : { target: jid, targetHandle: undefined }),
    data: { ...first.data, waypoints: undefined, manual: undefined, pinSource: undefined, pinTarget: undefined, startMarker: sameTarget ? 'none' : first.data?.startMarker, endMarker: sameTarget ? first.data?.endMarker : 'none' },
  };
  const out = [...edges.filter((e) => !drop.has(e.id)), ...shared, trunk];
  return { nodes: [...nodes, junction], edges: out, junctionId: jid };
}

export interface JunctionJoin {
  /** edges that end or start here */
  degree: number;
  /** draw a tiny dot in the edge colour: 3+ edges meet, or two edges turn a corner (fills the notch) */
  dot: boolean;
  color?: string;
}
/** directions (unit axis vectors, pointing AWAY from the junction) of every edge end at each junction. */
export function junctionJoins(nodes: DiagramNode[], edges: DiagramEdge[], routes: Map<string, Route>, colorOf: (edgeId: string) => string): Map<string, JunctionJoin> {
  const js = new Set(nodes.filter(isJunction).map((n) => n.id));
  const dirs = new Map<string, { dx: number; dy: number }[]>();
  const colors = new Map<string, string>();
  const away = (a: { x: number; y: number }, b: { x: number; y: number }) => {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.abs(dx) >= Math.abs(dy) ? { dx: Math.sign(dx), dy: 0 } : { dx: 0, dy: Math.sign(dy) };
  };
  for (const e of edges) {
    const r = routes.get(e.id);
    if (!r || r.points.length < 2) continue;
    const pts = r.points;
    if (js.has(e.source)) {
      dirs.set(e.source, [...(dirs.get(e.source) ?? []), away(pts[0], pts[1])]);
      if (!colors.has(e.source)) colors.set(e.source, colorOf(e.id));
    }
    if (js.has(e.target)) {
      dirs.set(e.target, [...(dirs.get(e.target) ?? []), away(pts[pts.length - 1], pts[pts.length - 2])]);
      if (!colors.has(e.target)) colors.set(e.target, colorOf(e.id));
    }
  }
  const out = new Map<string, JunctionJoin>();
  for (const [id, ds] of dirs) {
    const straight = ds.length === 2 && ds[0].dx === -ds[1].dx && ds[0].dy === -ds[1].dy;
    out.set(id, { degree: ds.length, dot: ds.length >= 3 || (ds.length === 2 && !straight), color: colors.get(id) });
  }
  return out;
}

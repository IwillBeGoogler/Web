import { measure, reversePoints, type FlowDir, type Measured, type Pt } from './geometry';
import type { FlowLook } from './resolve';

export interface FlowEdgeIn {
  id: string;
  source: string;
  target: string;
  /** routed polyline source -> target */
  points: Pt[];
  color: string;
  look: FlowLook;
  /** null: no packets */
  dir: FlowDir | null;
}

export interface FlowPath {
  id: string;
  /** every edge the path runs over (several when it continues through junctions) */
  edgeIds: string[];
  from: string;
  to: string;
  points: Pt[];
  color: string;
  look: FlowLook;
  m: Measured;
}

interface Seg { id: string; edge: FlowEdgeIn; from: string; to: string; points: Pt[] }

const join = (a: Pt[], b: Pt[]): Pt[] => {
  if (!a.length) return b;
  const first = b[0];
  const last = a[a.length - 1];
  return Math.hypot(first.x - last.x, first.y - last.y) < 0.5 ? [...a, ...b.slice(1)] : [...a, ...b];
};

/**
 * Directed flow lines. Edges that meet at a junction (a bus / trunk) are stitched so a packet runs seamlessly from the incoming edge
 * through the junction and along the trunk to the target; the whole chain is ONE path with one length (one timing). Cycles through
 * junctions terminate (an edge is used at most once per chain).
 */
export function buildFlowPaths(edges: FlowEdgeIn[], isJunction: (nodeId: string) => boolean): FlowPath[] {
  const segs: Seg[] = [];
  for (const e of edges) {
    if (!e.dir || e.points.length < 2) continue;
    if (e.dir === 'forward' || e.dir === 'both') segs.push({ id: `${e.id}:f`, edge: e, from: e.source, to: e.target, points: e.points });
    if (e.dir === 'reverse' || e.dir === 'both') segs.push({ id: `${e.id}:r`, edge: e, from: e.target, to: e.source, points: reversePoints(e.points) });
  }
  const out = new Map<string, Seg[]>();
  for (const s of segs) out.set(s.from, [...(out.get(s.from) ?? []), s]);
  const used = new Set<string>();
  const paths: FlowPath[] = [];
  const emit = (chain: Seg[], pts: Pt[]) => {
    const first = chain[0];
    const id = chain.map((c) => c.id).join('>');
    paths.push({ id, edgeIds: chain.map((c) => c.edge.id), from: first.from, to: chain[chain.length - 1].to, points: pts, color: first.edge.color, look: first.edge.look, m: measure(pts) });
  };
  const walk = (chain: Seg[], pts: Pt[]) => {
    for (const s of chain) used.add(s.id);
    const last = chain[chain.length - 1];
    if (isJunction(last.to)) {
      const next = (out.get(last.to) ?? []).filter((s) => !chain.some((c) => c.edge.id === s.edge.id));
      if (next.length) {
        for (const n of next) walk([...chain, n], join(pts, n.points));
        return;
      }
    }
    emit(chain, pts);
  };
  for (const s of segs) if (!isJunction(s.from)) walk([s], s.points);
  // lines that start at a junction nothing flows into (or only part of a cycle): keep them as their own paths
  for (const s of segs) if (!used.has(s.id)) walk([s], s.points);
  return paths;
}

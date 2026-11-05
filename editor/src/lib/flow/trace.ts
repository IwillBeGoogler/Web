import type { FlowDir } from './geometry';

export interface TraceEdge { id: string; source: string; target: string; dir: FlowDir | null }
export interface Trace { nodeIds: Set<string>; edgeIds: Set<string>; upstream: Set<string>; downstream: Set<string> }

/**
 * Everything upstream (data comes from) and downstream (data goes to) of a node, following the packet direction of each edge.
 * Edges without a direction are treated as two-way for tracing. Cycle-safe (every node is expanded once).
 */
export function traceFlow(start: string, edges: TraceEdge[]): Trace {
  const fwd = new Map<string, { to: string; edge: string }[]>();
  const back = new Map<string, { to: string; edge: string }[]>();
  const add = (m: typeof fwd, from: string, to: string, edge: string) => m.set(from, [...(m.get(from) ?? []), { to, edge }]);
  for (const e of edges) {
    const f = e.dir === null || e.dir === 'forward' || e.dir === 'both';
    const r = e.dir === null || e.dir === 'reverse' || e.dir === 'both';
    if (f) { add(fwd, e.source, e.target, e.id); add(back, e.target, e.source, e.id); }
    if (r) { add(fwd, e.target, e.source, e.id); add(back, e.source, e.target, e.id); }
  }
  const walk = (adj: typeof fwd, nodes: Set<string>, es: Set<string>) => {
    const seen = new Set<string>([start]);
    const queue = [start];
    while (queue.length) {
      const n = queue.shift()!;
      for (const { to, edge } of adj.get(n) ?? []) {
        es.add(edge);
        if (!seen.has(to)) { seen.add(to); nodes.add(to); queue.push(to); }
      }
    }
  };
  const downstream = new Set<string>();
  const upstream = new Set<string>();
  const edgeIds = new Set<string>();
  walk(fwd, downstream, edgeIds);
  walk(back, upstream, edgeIds);
  return { nodeIds: new Set([start, ...downstream, ...upstream]), edgeIds, upstream, downstream };
}

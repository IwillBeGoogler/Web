import type { EdgeTraffic, NodeCapacity } from '@core/capacity';
import { useDiagramStore } from '../../store/diagramStore';

type Patch<T> = { [K in keyof T]?: T[K] | null };
function merge<T extends object>(cur: T | undefined, patch: Patch<T>): T | undefined {
  const out: Record<string, unknown> = { ...(cur ?? {}) };
  for (const [k, v] of Object.entries(patch)) {
    if (v === null || v === undefined || v === '') delete out[k];
    else out[k] = v;
  }
  return Object.keys(out).length ? (out as T) : undefined;
}

/** edit the capacity inputs of a node: `null` clears a field, the object disappears when empty. One undo step. */
export function setNodeCapacity(id: string, patch: Patch<NodeCapacity>): void {
  useDiagramStore.getState().transform((ns, es) => {
    const n = ns.find((x) => x.id === id);
    if (!n) return null;
    const next = merge(n.data.capacity, patch);
    const { capacity: _drop, ...rest } = n.data;
    void _drop;
    return { nodes: ns.map((x) => (x.id === id ? { ...x, data: next ? { ...rest, capacity: next } : rest } : x)), edges: es };
  });
}
export function setEdgeTraffic(id: string, patch: Patch<EdgeTraffic>): void {
  useDiagramStore.getState().transform((ns, es) => {
    const e = es.find((x) => x.id === id);
    if (!e) return null;
    const next = merge(e.data?.traffic, patch);
    const { traffic: _drop, ...rest } = e.data ?? {};
    void _drop;
    return { nodes: ns, edges: es.map((x) => (x.id === id ? { ...x, data: next ? { ...rest, traffic: next } : rest } : x)) };
  });
}

/**
 * Capacity and latency calculator (deterministic arithmetic, no AI).
 *
 * Inputs live on the diagram: `node.data.capacity` (rps injected here, replicas, capacityRps per replica, p50Ms / p99Ms, payloadKb,
 * writeRatio, growthGbPerDay, storageGb, sku, monthlyCostUsd) and `edge.data.traffic` (ratio, p50Ms, p99Ms, payloadKb).
 * Demand is propagated along the edges: a node's load is its own rps plus, for every incoming edge, the caller's load times the
 * edge ratio (default 1: every request makes one call on each outgoing edge). Overload does not throttle the downstream demand, so
 * the numbers are the worst case. Cycles are broken at the edge that closes them.
 */
import type { CEdge, CNode, CPage } from '../types';
import { DEFAULT_SKU_BY_ICON, PRICES, PRICE_TABLE_DATE, SECONDS_PER_MONTH, priceSources, type PriceSource } from './prices';
import type { Provider } from './priceMap';

export interface NodeCapacity {
  rps?: number;
  replicas?: number;
  capacityRps?: number;
  p50Ms?: number;
  p99Ms?: number;
  payloadKb?: number;
  writeRatio?: number;
  growthGbPerDay?: number;
  storageGb?: number;
  sku?: string;
  monthlyCostUsd?: number;
}
export interface EdgeTraffic { ratio?: number; p50Ms?: number; p99Ms?: number; payloadKb?: number }

export type Status = 'ok' | 'warn' | 'over' | 'unknown';
export interface NodeResult {
  load: number;
  /** replicas x capacityRps, when the node has a capacity */
  capacity?: number;
  utilization?: number;
  status: Status;
  storageGbPerDay?: number;
  costUsdMonth?: number;
  costAssumed?: boolean;
  costLabel?: string;
}
export interface EdgeResult { rps: number; mbps: number }
export interface PathResult { nodeIds: string[]; edgeIds: string[]; p50Ms: number; p99Ms: number; incomplete: boolean }
export interface CapacityResult {
  nodes: Record<string, NodeResult>;
  edges: Record<string, EdgeResult>;
  bottlenecks: string[];
  worstPath: PathResult | null;
  totals: { costUsdMonth: number; storageGbPerMonth: number; storageGbPerYear: number; egressGbPerMonth: number };
  warnings: string[];
  priceTableDate: string;
  /** provenance of the prices used by this page (all providers with prices when none is used yet) */
  priceSources: PriceSource[];
  disclaimer: string;
}
export interface CapacityOptions { /** utilization at which a node is "warn" (default 0.7) */ warnAt?: number }

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const DIAGRAM_TYPES = new Set(['icon', 'cluster', 'card', 'table', 'class', 'component', 'usecase', 'shape']);
export const capOf = (n: CNode): NodeCapacity => (n.data.capacity && typeof n.data.capacity === 'object' ? (n.data.capacity as NodeCapacity) : {});
export const trafficOf = (e: CEdge): EdgeTraffic => (e.data?.traffic && typeof e.data.traffic === 'object' ? (e.data.traffic as EdgeTraffic) : {});

export function analyzeCapacity(page: CPage, opts: CapacityOptions = {}): CapacityResult {
  const warnAt = opts.warnAt ?? 0.7;
  const warnings: string[] = [];
  const usedProviders = new Set<Provider>();
  const nodes = page.nodes.filter((n) => DIAGRAM_TYPES.has(n.type));
  const ids = new Set(nodes.map((n) => n.id));
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const edges = page.edges.filter((e) => ids.has(e.source) && ids.has(e.target) && e.source !== e.target);

  // break cycles: an edge into a node that is still on the DFS stack closes a cycle
  const out = new Map<string, CEdge[]>(nodes.map((n) => [n.id, []]));
  for (const e of edges) out.get(e.source)!.push(e);
  const state = new Map<string, 1 | 2>();
  const back = new Set<string>();
  const visit = (v: string) => {
    state.set(v, 1);
    for (const e of out.get(v)!) {
      const s = state.get(e.target);
      if (s === 1) { back.add(e.id); warnings.push(`Cycle ignored at ${byId.get(e.source)!.data.label} → ${byId.get(e.target)!.data.label}`); }
      else if (!s) visit(e.target);
    }
    state.set(v, 2);
  };
  for (const n of nodes) if (!state.has(n.id)) visit(n.id);
  const dag = edges.filter((e) => !back.has(e.id));

  // topological order (Kahn, input order breaks ties)
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of dag) indeg.set(e.target, indeg.get(e.target)! + 1);
  const order: string[] = [];
  const ready = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  while (ready.length) {
    const v = ready.shift()!;
    order.push(v);
    for (const e of dag.filter((x) => x.source === v)) {
      indeg.set(e.target, indeg.get(e.target)! - 1);
      if (indeg.get(e.target) === 0) ready.push(e.target);
    }
  }

  const load = new Map<string, number>(nodes.map((n) => [n.id, num(capOf(n).rps) ?? 0]));
  const edgeRps = new Map<string, number>();
  for (const v of order) for (const e of dag.filter((x) => x.source === v)) {
    const r = load.get(v)! * (num(trafficOf(e).ratio) ?? 1);
    edgeRps.set(e.id, r);
    load.set(e.target, load.get(e.target)! + r);
  }

  const res: Record<string, NodeResult> = {};
  const edgeRes: Record<string, EdgeResult> = {};
  const totals = { costUsdMonth: 0, storageGbPerMonth: 0, storageGbPerYear: 0, egressGbPerMonth: 0 };
  const inKbps = new Map<string, number>(); // kilobytes per second flowing into each node
  for (const e of dag) {
    const rps = edgeRps.get(e.id) ?? 0;
    const kb = num(trafficOf(e).payloadKb) ?? num(capOf(byId.get(e.source)!).payloadKb) ?? 0;
    edgeRes[e.id] = { rps, mbps: (rps * kb * 8) / 1000 };
    inKbps.set(e.target, (inKbps.get(e.target) ?? 0) + rps * kb);
  }

  for (const n of nodes) {
    const c = capOf(n);
    const l = load.get(n.id)!;
    const per = num(c.capacityRps);
    const capacity = per !== undefined && per > 0 ? (num(c.replicas) ?? 1) * per : undefined;
    const utilization = capacity !== undefined ? l / capacity : undefined;
    const status: Status = utilization === undefined ? 'unknown' : utilization > 1 ? 'over' : utilization >= warnAt ? 'warn' : 'ok';
    const r: NodeResult = { load: l, status, ...(capacity !== undefined ? { capacity, utilization } : {}) };
    // storage growth
    const growth = num(c.growthGbPerDay) ?? (num(c.writeRatio) !== undefined ? (l * num(c.writeRatio)! * (num(c.payloadKb) ?? 1) * 86400) / 1e6 : undefined);
    if (growth !== undefined && growth > 0) {
      r.storageGbPerDay = growth;
      totals.storageGbPerMonth += growth * 30;
      totals.storageGbPerYear += growth * 365;
    }
    // cost
    const explicit = typeof c.sku === 'string' && c.sku ? c.sku : undefined;
    const sku = explicit ?? DEFAULT_SKU_BY_ICON[String(n.data.iconId ?? '')];
    const fixed = num(c.monthlyCostUsd);
    if (fixed !== undefined) { r.costUsdMonth = fixed; r.costAssumed = false; r.costLabel = 'entered by you'; }
    else if (sku) {
      const price = PRICES[sku];
      if (!price) warnings.push(`Unknown price "${sku}" on ${n.data.label}`);
      else {
        const usd =
          price.unit === 'instance-month' ? price.usd * (num(c.replicas) ?? 1)
          : price.unit === 'per-million-requests' ? ((l * SECONDS_PER_MONTH) / 1e6) * price.usd
          : price.unit === 'per-gb-month' ? (num(c.storageGb) ?? 0) * price.usd
          : (((inKbps.get(n.id) ?? 0) * SECONDS_PER_MONTH) / 1e6) * price.usd;
        r.costUsdMonth = usd;
        r.costAssumed = !explicit;
        r.costLabel = price.label;
        usedProviders.add(price.provider);
        if (price.unit === 'per-gb-transfer') totals.egressGbPerMonth += ((inKbps.get(n.id) ?? 0) * SECONDS_PER_MONTH) / 1e6;
      }
    }
    if (r.costUsdMonth !== undefined) totals.costUsdMonth += r.costUsdMonth;
    res[n.id] = r;
  }
  const bottlenecks = nodes.map((n) => n.id).filter((id) => res[id].status === 'over' || res[id].status === 'warn').sort((a, b) => res[b].utilization! - res[a].utilization! || (a < b ? -1 : 1));

  // worst-case path: the largest summed p99 over every path of the DAG (DP in reverse topological order)
  const hasLatency = nodes.some((n) => num(capOf(n).p99Ms) !== undefined || num(capOf(n).p50Ms) !== undefined) || dag.some((e) => num(trafficOf(e).p99Ms) !== undefined || num(trafficOf(e).p50Ms) !== undefined);
  let worstPath: PathResult | null = null;
  if (hasLatency) {
    const best = new Map<string, PathResult>();
    const own = (n: CNode) => ({ p99: num(capOf(n).p99Ms) ?? 0, p50: num(capOf(n).p50Ms) ?? 0, miss: num(capOf(n).p99Ms) === undefined });
    for (const v of [...order].reverse()) {
      const n = byId.get(v)!;
      const o = own(n);
      let tail: PathResult = { nodeIds: [], edgeIds: [], p50Ms: 0, p99Ms: 0, incomplete: false };
      for (const e of dag.filter((x) => x.source === v)) {
        const sub = best.get(e.target)!;
        const t = trafficOf(e);
        const cand: PathResult = { nodeIds: sub.nodeIds, edgeIds: [e.id, ...sub.edgeIds], p50Ms: sub.p50Ms + (num(t.p50Ms) ?? 0), p99Ms: sub.p99Ms + (num(t.p99Ms) ?? 0), incomplete: sub.incomplete || num(t.p99Ms) === undefined };
        if (cand.p99Ms > tail.p99Ms || tail.nodeIds.length === 0 && tail.edgeIds.length === 0 && sub.nodeIds.length) tail = cand;
      }
      best.set(v, { nodeIds: [v, ...tail.nodeIds], edgeIds: tail.edgeIds, p50Ms: tail.p50Ms + o.p50, p99Ms: tail.p99Ms + o.p99, incomplete: tail.incomplete || o.miss });
    }
    const entries = nodes.filter((n) => !dag.some((e) => e.target === n.id)).map((n) => best.get(n.id)!);
    worstPath = entries.sort((a, b) => b.p99Ms - a.p99Ms || (a.nodeIds[0] < b.nodeIds[0] ? -1 : 1))[0] ?? null;
    if (worstPath && worstPath.p99Ms === 0 && worstPath.p50Ms === 0) worstPath = null;
  }

  return {
    nodes: res, edges: edgeRes, bottlenecks, worstPath, totals, warnings: [...new Set(warnings)],
    priceTableDate: PRICE_TABLE_DATE,
    priceSources: priceSources(usedProviders.size ? usedProviders : undefined),
    disclaimer: 'Rough estimate from provider list prices (on-demand, one region, no discounts, no tax); check the provider calculator before budgeting.',
  };
}
export { PRICES, PRICE_TABLE_DATE, DEFAULT_SKU_BY_ICON, priceSources, describePriceSource } from './prices';

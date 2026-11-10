/**
 * Capacity and latency calculator (deterministic arithmetic, no AI).
 *
 * Inputs live on the diagram: `node.data.capacity` (rps injected here, replicas, capacityRps per replica, p50Ms / p99Ms, payloadKb,
 * writeRatio, growthGbPerDay, storageGb, sku, monthlyCostUsd) and `edge.data.traffic` (ratio, p50Ms, p99Ms, payloadKb).
 * Demand is propagated along the edges: a node's load is its own rps plus, for every incoming edge, the caller's load times the
 * edge ratio (default 1: every request makes one call on each outgoing edge; lb / gateway / waf instead split their load evenly
 * over edges without a ratio, see SPLIT_ROLES and option `fanOut`). An overloaded node serves min(load, capacity) and
 * passes only that downstream (option `throttle`, default true; `throttle:false` keeps the old worst-case numbers). Cycles are broken at the edge that closes them.
 *
 * Architecture config (`node.data.arch`, see core/arch; opt-in per node): a cache / CDN forwards only `load * (1 - hitRate)` on its
 * outgoing edges; when `capacity.replicas` is unset, replicas / throughput come from the arch (service instances, database
 * replicas with reads scaling and writes not, kafka partitions, ...). Explicit capacity fields always win.
 */
import type { CEdge, CNode, CPage } from '../types';
import { DEFAULT_SKU_BY_ICON, PRICES, PRICE_TABLE_DATE, SECONDS_PER_MONTH, priceSources, type PriceSource } from './prices';
import type { Provider } from './priceMap';
import { archOf, archScale, hasArch, techOf } from '../arch';
import { roleOf } from '../lint';

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
  /** node availability in percent (e.g. 99.95); default by role, see DEFAULT_AVAILABILITY */
  availability?: number;
  /** queue role: total rate the consumers can drain (msg/s); default = what the downstream nodes can take */
  consumerRps?: number;
}
export interface EdgeTraffic {
  ratio?: number; p50Ms?: number; p99Ms?: number; payloadKb?: number;
  /** extra attempts after a failed call (default 0); a failure is a drop at the target or a timeout */
  retries?: number;
  /** a call slower than this fails (and is retried); unset = no timeout */
  timeoutMs?: number;
  /** wait before each retry (ms) */
  backoffMs?: number;
}

export type Status = 'ok' | 'warn' | 'over' | 'down' | 'unknown';
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
  /** requests served = min(load, capacity) when throttling */
  served: number;
  /** fraction of the incoming load this node drops (0..1): 1 - 1/rho when rho >= 1, 1 when down */
  droppedFraction: number;
  /** queueing factor 1/(1-rho), capped at MAX_QUEUE_FACTOR; 1 without a capacity */
  latencyFactor: number;
  /** rho >= 1: the queue grows without bound, latency is shown at the cap */
  saturated: boolean;
  /** effective latency after queueing and chaos */
  p50Ms?: number;
  p99Ms?: number;
  /** availability 0..1 of this node (redundancy and deployment applied) */
  availability: number;
  chaos?: ChaosState;
  /** capacity / latency came (at least partly) from ROLE_DEFAULTS (option `assumeDefaults`), not from the diagram */
  assumed?: boolean;
  /** queue only: msg/s accepted but not forwarded (the consumers are slower than the producers); the queue buffers it, nothing is dropped */
  backlogRps?: number;
  /** queue only: messages piled up after `spikeDurationSec` of that rate */
  backlogMsgs?: number;
  /** queue only: seconds to empty that backlog once the spike ends (Infinity = the consumers never catch up) */
  timeToDrainSec?: number;
  /** queue only: the backlog outlives the retention (arch `retentionHours`, default 168), so messages would be lost */
  retentionExceeded?: boolean;
}
export type ChaosState = 'down' | 'slow';
export interface ChaosInput { nodes?: Record<string, ChaosState | undefined>; /** global entry traffic multiplier */ spike?: number }
/** compute-time defaults by role for the simulation (never written to the document): per-replica rps and latency in ms */
export const ROLE_DEFAULTS: Record<string, { capacityRps: number; p50Ms: number; p99Ms: number; /** percent; cache / cdn without `arch` (keep in sync with the core/arch defaults) */ hitRate?: number }> = {
  lb: { capacityRps: 50000, p50Ms: 1, p99Ms: 2 },
  gateway: { capacityRps: 20000, p50Ms: 2, p99Ms: 5 },
  cdn: { capacityRps: 100000, p50Ms: 4, p99Ms: 10, hitRate: 90 },
  service: { capacityRps: 2000, p50Ms: 20, p99Ms: 50 },
  cache: { capacityRps: 50000, p50Ms: 1, p99Ms: 2, hitRate: 80 },
  database: { capacityRps: 2000, p50Ms: 5, p99Ms: 15 },
  queue: { capacityRps: 20000, p50Ms: 4, p99Ms: 10 },
  storage: { capacityRps: 5000, p50Ms: 12, p99Ms: 30 },
  waf: { capacityRps: 50000, p50Ms: 1, p99Ms: 2 },
};
/** roles that route a request to one backend instead of calling all of them */
export const SPLIT_ROLES: ReadonlySet<string> = new Set(['lb', 'gateway', 'waf']);
export const MAX_QUEUE_FACTOR = 20;
export const SLOW_FACTOR = 5;
/** availability in percent by role (unlisted roles do not count against the system) */
export const DEFAULT_AVAILABILITY: Record<string, number> = { service: 99.9, database: 99.95, cache: 99.9, queue: 99.95, lb: 99.99, cdn: 99.99, storage: 99.99, gateway: 99.95, waf: 99.99 };
/** queueing factor of an M/M/1-like node */
export const queueFactor = (rho: number): number => (rho >= 1 ? MAX_QUEUE_FACTOR : Math.min(MAX_QUEUE_FACTOR, 1 / (1 - rho)));
/**
 * M/M/1 waiting time (ms) at percentile q (0..1) for utilization rho and mean service time serviceMs:
 * P(W > t) = rho * exp(-(1 - rho) t / S), so the tail grows faster than the mean; 0 while rho <= 1 - q (the percentile never waits).
 */
export const queueWaitMs = (rho: number, serviceMs: number, q: number): number => (rho >= 1 ? Infinity : Math.max(0, Math.log(rho / (1 - q))) * (serviceMs / (1 - rho)));
export interface EdgeResult {
  rps: number; mbps: number;
  /** attempts per call with retries: 1 + f + f^2 ... (1 without retries) */
  amplification?: number;
  /** share of the calls on this edge that fail (drop or timeout at the target), only with retries */
  failRate?: number;
}
export interface PathResult { nodeIds: string[]; edgeIds: string[]; p50Ms: number; /** sum of the per-hop p99: an upper bound, the hops rarely all hit their tail at once */ p99Ms: number; /** realistic p99: sum of p50 + root of the summed squared tails; always <= p99Ms */ p99EstMs?: number; incomplete: boolean; /** the path ends at a node taken down by chaos: its requests fail, so it has no meaningful latency */ broken?: boolean }
export interface CapacityResult {
  nodes: Record<string, NodeResult>;
  edges: Record<string, EdgeResult>;
  bottlenecks: string[];
  worstPath: PathResult | null;
  totals: {
    costUsdMonth: number; storageGbPerMonth: number; storageGbPerYear: number; egressGbPerMonth: number;
    /** sum of the entry load (after a traffic spike) */
    rpsIn: number;
    /** p99 of the worst path with queueing, 0 when no latency is entered. Upper bound: the sum of the per-hop p99 (see worstPath.p99EstMs) */
    p99Ms: number;
    /** system availability 0..1: weakest entry-to-leaf path x (1 - dropped) */
    availability: number;
    /** share of requests that never reach the leaves, 0..100 */
    droppedPct: number;
    /** retries amplify the load until a node collapses: the retry loop did not settle (true = retry storm) */
    retryStorm: boolean;
    /** sum of the queue backlog growth rates (msg/s) */
    backlogRps: number;
    budgetUsd?: number;
    overBudget: boolean;
  };
  warnings: string[];
  priceTableDate: string;
  /** provenance of the prices used by this page (all providers with prices when none is used yet) */
  priceSources: PriceSource[];
  disclaimer: string;
}
export interface CapacityOptions {
  /** utilization at which a node is "warn" (default 0.7) */ warnAt?: number;
  /** an overloaded node serves only min(load, capacity) and passes that downstream (default true; false = old worst-case numbers) */
  throttle?: boolean;
  /** per-node chaos (down / slow) and a global traffic multiplier; never persisted */
  chaos?: ChaosInput;
  /** monthly budget in USD: a warning and totals.overBudget when the cost is above it */
  budgetUsd?: number;
  /** fill missing capacityRps / p50Ms / p99Ms from ROLE_DEFAULTS (compute-time only; those nodes get `assumed: true`) */
  assumeDefaults?: boolean;
  /** entry rps used when no node has an rps of its own (read-only simulation); applied to the first entry node */
  defaultEntryRps?: number;
  /** 'split' (default): lb / gateway / waf share the load of edges without a ratio; 'broadcast': every edge gets the full load (old behaviour) */
  fanOut?: 'split' | 'broadcast';
  /** how long a traffic spike lasts, for queue backlog sizing (default 300 s) */
  spikeDurationSec?: number;
  /** 'percentile' (default): p50 / p99 queueing from the M/M/1 waiting-time distribution; 'factor': both scale by 1/(1-rho) (old numbers) */
  latencyModel?: 'percentile' | 'factor';
}

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : undefined);
const DIAGRAM_TYPES = new Set(['icon', 'cluster', 'card', 'table', 'class', 'component', 'usecase', 'shape']);
export const capOf = (n: CNode): NodeCapacity => (n.data.capacity && typeof n.data.capacity === 'object' ? (n.data.capacity as NodeCapacity) : {});
export const trafficOf = (e: CEdge): EdgeTraffic => (e.data?.traffic && typeof e.data.traffic === 'object' ? (e.data.traffic as EdgeTraffic) : {});

/** redundancy of a node: instances that can serve (explicit replicas first, then what the architecture implies) */
function instancesOf(n: CNode, c: NodeCapacity, scale: ReturnType<typeof archScale>): number {
  const explicit = num(c.replicas);
  if (explicit !== undefined) return Math.max(1, explicit);
  if (!hasArch(n)) return 1;
  const a = archOf(n);
  const tech = techOf(n)?.id;
  if (tech === 'kafka' || tech === 'cassandra') return Math.max(1, Number(a.replicationFactor));
  if (tech === 'mongodb') return Math.max(1, Number(a.replicaSetMembers));
  return Math.max(1, scale?.count ?? 1);
}
/** a (percent, default by role); n instances: 1-(1-a)^n; multi-az cuts the unavailability by 10x, multi-region by 100x */
export function nodeAvailability(n: CNode, c: NodeCapacity, scale: ReturnType<typeof archScale>): number {
  const set = num(c.availability);
  const a = Math.min(1, (set ?? DEFAULT_AVAILABILITY[roleOf(n)] ?? 100) / 100);
  let un = Math.pow(1 - a, instancesOf(n, c, scale));
  if (hasArch(n)) {
    const dep = archOf(n).deployment;
    if (dep === 'multi-az') un *= 0.1;
    else if (dep === 'multi-region') un *= 0.01;
  }
  return Math.min(1, Math.max(0, 1 - un));
}

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
  // adjacency of the acyclic graph, built once (edge order = dag order)
  const dagOut = new Map<string, CEdge[]>(nodes.map((n) => [n.id, []]));
  const dagIn = new Map<string, CEdge[]>(nodes.map((n) => [n.id, []]));
  for (const e of dag) { dagOut.get(e.source)!.push(e); dagIn.get(e.target)!.push(e); }
  const isEntry = (id: string) => dagIn.get(id)!.length === 0;
  const isSink = (id: string) => dagOut.get(id)!.length === 0;

  // topological order (Kahn, input order breaks ties)
  const indeg = new Map(nodes.map((n) => [n.id, 0]));
  for (const e of dag) indeg.set(e.target, indeg.get(e.target)! + 1);
  const order: string[] = [];
  const ready = nodes.filter((n) => indeg.get(n.id) === 0).map((n) => n.id);
  for (let i = 0; i < ready.length; i++) {
    const v = ready[i];
    order.push(v);
    for (const e of dagOut.get(v)!) {
      indeg.set(e.target, indeg.get(e.target)! - 1);
      if (indeg.get(e.target) === 0) ready.push(e.target);
    }
  }

  const throttle = opts.throttle ?? true;
  const chaosOf = (id: string): ChaosState | undefined => opts.chaos?.nodes?.[id];
  const spike = opts.chaos?.spike && opts.chaos.spike > 0 ? opts.chaos.spike : 1;

  // capacity per node (replicas x per-replica rps); depends on the node only, so it is known before the load propagates
  const assumedOf = new Map<string, boolean>();
  const defOf = (n: CNode) => (opts.assumeDefaults ? ROLE_DEFAULTS[roleOf(n)] : undefined);
  const capOfNode = new Map<string, number | undefined>();
  const perOf = new Map<string, number | undefined>(); // per-replica rps
  const scaleOf = new Map<string, ReturnType<typeof archScale>>();
  const missOf = new Map<string, number>();
  for (const n of nodes) {
    const c = capOf(n);
    const def = defOf(n);
    const per = num(c.capacityRps) ?? def?.capacityRps;
    if (def && (num(c.capacityRps) === undefined || num(c.p50Ms) === undefined || num(c.p99Ms) === undefined)) assumedOf.set(n.id, true);
    const scale = archScale(n, roleOf(n), num(c.writeRatio));
    scaleOf.set(n.id, scale);
    // cache / cdn forward only the misses; hit rate from the arch, else the role default (assumeDefaults only)
    const role = roleOf(n);
    let hit = 0;
    if (role === 'cache' || role === 'cdn') {
      if (hasArch(n)) hit = Number(archOf(n).hitRate);
      else if (opts.assumeDefaults && (ROLE_DEFAULTS[role]?.hitRate ?? 0) > 0) { hit = ROLE_DEFAULTS[role].hitRate!; assumedOf.set(n.id, true); }
    }
    missOf.set(n.id, 1 - (Number.isFinite(hit) ? hit : 0) / 100);
    perOf.set(n.id, per !== undefined && per > 0 ? per : undefined);
    const capacity = per !== undefined && per > 0 ? (num(c.replicas) !== undefined ? num(c.replicas)! * per : (scale?.mult ?? 1) * per) : undefined;
    capOfNode.set(n.id, chaosOf(n.id) === 'down' ? 0 : capacity);
  }

  // entry traffic: the node's own rps; with none anywhere, `defaultEntryRps` goes to the first entry node (client preferred)
  const anyRps = nodes.some((n) => (num(capOf(n).rps) ?? 0) > 0);
  let fallbackEntry: string | undefined;
  if (!anyRps && num(opts.defaultEntryRps)) {
    const entries = order.filter((id) => isEntry(id) && !isSink(id));
    fallbackEntry = entries.find((id) => roleOf(byId.get(id)!) === 'client') ?? entries[0];
  }
  const ownRps = (id: string) => (id === fallbackEntry ? opts.defaultEntryRps! : num(capOf(byId.get(id)!).rps) ?? 0);

  // per-edge call ratio: explicit `ratio` wins. lb / gateway / waf send each request to ONE backend, so unset edges share the
  // remainder evenly (an lb skips unset edges into a down node while a healthy one remains). Other roles call every edge (ratio 1).
  const ratioOf = new Map<string, number>();
  for (const n of nodes) {
    const outs = dagOut.get(n.id)!;
    const split = (opts.fanOut ?? 'split') === 'split' && SPLIT_ROLES.has(roleOf(n));
    if (!split) { for (const e of outs) ratioOf.set(e.id, num(trafficOf(e).ratio) ?? 1); continue; }
    const unset = outs.filter((e) => num(trafficOf(e).ratio) === undefined);
    const explicitSum = outs.reduce((a, e) => a + (num(trafficOf(e).ratio) ?? 0), 0);
    let targets = unset;
    if (roleOf(n) === 'lb' && archOf(n).healthCheck !== false) {
      const healthy = unset.filter((e) => chaosOf(e.target) !== 'down');
      if (healthy.length) targets = healthy;
    }
    const share = targets.length ? Math.max(0, 1 - explicitSum) / targets.length : 0;
    for (const e of outs) ratioOf.set(e.id, num(trafficOf(e).ratio) ?? (targets.includes(e) ? share : 0));
  }

  /** effective p50 / p99 (ms) of a node at utilization `rho` (undefined = no capacity); also the legacy queueing factor */
  const nodeLat = (n: CNode, rho: number | undefined, ch?: ChaosState) => {
    const c = capOf(n), def = defOf(n), down = ch === 'down';
    const slow = ch === 'slow' ? SLOW_FACTOR : 1;
    const factor = (rho === undefined || down ? 1 : queueFactor(rho)) * slow;
    const b50 = num(c.p50Ms) ?? def?.p50Ms, b99 = num(c.p99Ms) ?? def?.p99Ms;
    const per = perOf.get(n.id);
    const byWait = (opts.latencyModel ?? 'percentile') === 'percentile' && !down && rho !== undefined && Number.isFinite(rho) && rho < 1 && per !== undefined;
    const lat = (base: number | undefined, q: number) => (base === undefined ? undefined : byWait ? Math.min(base * MAX_QUEUE_FACTOR, base + queueWaitMs(rho!, 1000 / per!, q)) * slow : base * factor);
    return { p50: lat(b50, 0.5), p99: lat(b99, 0.99), factor };
  };
  // retries: failure share of the calls into `target` (drop + timeout); amplification = 1 + f + f^2 + ... + f^retries
  const retriesOf = (e: CEdge) => Math.min(10, Math.floor(num(trafficOf(e).retries) ?? 0));
  const ampOf = new Map<string, number>();
  const failOf = (e: CEdge, loadMap: Map<string, number>) => {
    const t = byId.get(e.target)!;
    const ch = chaosOf(t.id);
    if (ch === 'down') return 1;
    const cap = capOfNode.get(t.id);
    const rho = cap === undefined ? undefined : cap === 0 ? Infinity : loadMap.get(t.id)! / cap;
    const drop = rho !== undefined && rho >= 1 ? 1 - 1 / rho : 0;
    const timeout = num(trafficOf(e).timeoutMs);
    let tail = 0;
    if (timeout !== undefined) {
      const lat = nodeLat(t, rho, ch);
      tail = lat.p50 !== undefined && lat.p50 > timeout ? 0.5 : lat.p99 !== undefined && lat.p99 > timeout ? 0.01 : 0;
    }
    return Math.min(1, drop + (1 - drop) * tail);
  };
  const ampFor = (f: number, r: number) => { let a = 0, p = 1; for (let k = 0; k <= r; k++) { a += p; p *= f; } return a; };

  // queue drain rate: explicit consumerRps, else the slowest consumer (capacity / its call ratio); Infinity when nothing limits it
  const drainOf = new Map<string, number>();
  for (const n of nodes) {
    if (roleOf(n) !== 'queue') continue;
    const explicit = num(capOf(n).consumerRps);
    if (explicit !== undefined) { drainOf.set(n.id, explicit); continue; }
    let d = Infinity;
    for (const e of dagOut.get(n.id)!) {
      const cap = capOfNode.get(e.target), ratio = (ratioOf.get(e.id) ?? 1) * missOf.get(n.id)!;
      if (cap !== undefined && ratio > 0) d = Math.min(d, cap / ratio);
    }
    drainOf.set(n.id, d);
  }

  /** push demand through the DAG; `limit` throttles every node at its capacity, `drainLimit` also holds a queue back at its drain rate (the rest is backlog) */
  const propagate = (limit: boolean, drainLimit = true, retry = true) => {
    const load = new Map<string, number>(nodes.map((n) => [n.id, ownRps(n.id) * spike]));
    const served = new Map<string, number>();
    const edgeRps = new Map<string, number>();
    const backlog = new Map<string, number>();
    for (const v of order) {
      const cap = capOfNode.get(v);
      const l = load.get(v)!;
      const sv = limit && cap !== undefined ? Math.min(l, cap) : l;
      served.set(v, sv);
      const fwd = limit && drainLimit && drainOf.has(v) ? Math.min(sv, drainOf.get(v)!) : sv;
      if (fwd < sv) backlog.set(v, sv - fwd);
      const miss = missOf.get(v)!;
      for (const e of dagOut.get(v)!) {
        const r = fwd * ratioOf.get(e.id)! * miss * (retry ? ampOf.get(e.id) ?? 1 : 1);
        edgeRps.set(e.id, r);
        load.set(e.target, load.get(e.target)! + r);
      }
    }
    return { load, served, edgeRps, backlog };
  };
  // retry loop: the failure share depends on the load, which the retries raise; damped fixed point, up to 10 rounds
  const retryEdges = throttle ? dag.filter((e) => retriesOf(e) > 0) : [];
  let retryStorm = false;
  for (let it = 0; retryEdges.length && it < 10; it++) {
    const cur = propagate(throttle);
    let delta = 0;
    for (const e of retryEdges) {
      const prev = ampOf.get(e.id) ?? 1;
      const next = (prev + ampFor(failOf(e, cur.load), retriesOf(e))) / 2;
      delta = Math.max(delta, Math.abs(next - prev) / prev);
      ampOf.set(e.id, next);
    }
    if (delta < 1e-3) break;
    if (it === 9) retryStorm = true;
  }
  const real = propagate(throttle);
  const load = real.load;
  const edgeRps = real.edgeRps;
  // dropped share: what the leaves get compared with an unthrottled, healthy run
  const ideal = propagate(false, true, false);
  const sinks = nodes.filter((n) => isSink(n.id));
  const idealSink = sinks.reduce((a, n) => a + ideal.load.get(n.id)!, 0);
  // a backlog that the consumers work off after the spike (and within the retention) is delayed, not lost: credit it to the leaves
  const backlogOf = (id: string, backlogRps: number) => {
    const n = byId.get(id)!;
    const spare = drainOf.get(id)! - real.load.get(id)! / spike;
    const msgs = backlogRps * (num(opts.spikeDurationSec) ?? 300);
    const retentionH = hasArch(n) ? Number(archOf(n).retentionHours) : 168;
    const retention = (Number.isFinite(retentionH) && retentionH > 0 ? retentionH : 168) * 3600;
    const timeToDrainSec = spare > 0 ? msgs / spare : Infinity;
    return { msgs, timeToDrainSec, retentionExceeded: timeToDrainSec > retention };
  };
  let recovered = 0;
  for (const [id, b] of real.backlog) {
    if (backlogOf(id, b).retentionExceeded) continue;
    const q = ideal.served.get(id)!;
    if (q > 0) recovered += b * (idealSink / q);
  }
  const realSink = sinks.reduce((a, n) => a + real.served.get(n.id)!, 0) + recovered;
  const droppedPct = throttle && idealSink > 0 ? Math.min(100, Math.max(0, (1 - realSink / idealSink) * 100)) : 0;

  const res: Record<string, NodeResult> = {};
  const edgeRes: Record<string, EdgeResult> = {};
  const totals = { costUsdMonth: 0, storageGbPerMonth: 0, storageGbPerYear: 0, egressGbPerMonth: 0, rpsIn: 0, p99Ms: 0, availability: 1, droppedPct, retryStorm: false, backlogRps: 0, overBudget: false } as CapacityResult['totals'];
  const retryMs = new Map<string, number>(); // expected extra latency per call from failed attempts
  const inKbps = new Map<string, number>(); // kilobytes per second flowing into each node
  for (const e of dag) {
    const rps = edgeRps.get(e.id) ?? 0;
    const kb = num(trafficOf(e).payloadKb) ?? num(capOf(byId.get(e.source)!).payloadKb) ?? 0;
    edgeRes[e.id] = { rps, mbps: (rps * kb * 8) / 1000 };
    if (retryEdges.includes(e)) {
      const f = failOf(e, load);
      edgeRes[e.id].failRate = f;
      edgeRes[e.id].amplification = ampFor(f, retriesOf(e));
      const timeout = num(trafficOf(e).timeoutMs);
      if (timeout !== undefined) retryMs.set(e.id, f * (timeout + (num(trafficOf(e).backoffMs) ?? 0)));
    }
    inKbps.set(e.target, (inKbps.get(e.target) ?? 0) + rps * kb);
  }

  for (const n of nodes) {
    const c = capOf(n);
    const l = load.get(n.id)!;
    const scale = scaleOf.get(n.id);
    const ch = chaosOf(n.id);
    const capacity = capOfNode.get(n.id);
    const down = ch === 'down';
    const utilization = capacity === undefined ? undefined : capacity === 0 ? (l > 0 ? Infinity : 0) : l / capacity;
    const backlogRps = down ? 0 : real.backlog.get(n.id) ?? 0;
    const status: Status = down ? 'down' : utilization === undefined ? (backlogRps > 0 ? 'warn' : 'unknown') : utilization >= 1 ? 'over' : utilization >= warnAt || backlogRps > 0 ? 'warn' : 'ok';
    const saturated = !down && utilization !== undefined && utilization >= 1;
    const droppedFraction = down ? (l > 0 ? 1 : 0) : saturated ? 1 - 1 / utilization! : 0;
    const { p50: l50, p99: l99, factor } = nodeLat(n, utilization, ch);
    const r: NodeResult = {
      load: l, status, served: real.served.get(n.id)!, droppedFraction, latencyFactor: factor, saturated,
      ...(l50 !== undefined ? { p50Ms: l50 } : {}), ...(l99 !== undefined ? { p99Ms: l99 } : {}),
      availability: down ? 0 : nodeAvailability(n, c, scale),
      ...(ch ? { chaos: ch } : {}),
      ...(assumedOf.get(n.id) ? { assumed: true } : {}),
      ...(capacity !== undefined ? { capacity, utilization } : {}),
    };
    if (backlogRps > 0) {
      const bl = backlogOf(n.id, backlogRps);
      r.backlogRps = backlogRps;
      r.backlogMsgs = bl.msgs;
      r.timeToDrainSec = bl.timeToDrainSec;
      r.retentionExceeded = bl.retentionExceeded;
      totals.backlogRps += backlogRps;
      warnings.push(`Queue ${n.data.label} backlog grows ${Math.round(backlogRps).toLocaleString('en-US')} msg/s (${Number.isFinite(r.timeToDrainSec) ? `drains in ${Math.round(r.timeToDrainSec)} s after the spike` : 'consumers never catch up'})`);
    }
    totals.rpsIn += ownRps(n.id) * spike;
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
          price.unit === 'instance-month' ? price.usd * (num(c.replicas) ?? scale?.count ?? 1)
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
  const bottlenecks = nodes.map((n) => n.id).filter((id) => res[id].status === 'over' || res[id].status === 'warn').sort((a, b) => (res[b].utilization ?? 0) - (res[a].utilization ?? 0) || (a < b ? -1 : 1));

  // worst-case path: the largest summed p99 over every path of the DAG (DP in reverse topological order)
  const hasLatency = !!opts.assumeDefaults || nodes.some((n) => num(capOf(n).p99Ms) !== undefined || num(capOf(n).p50Ms) !== undefined) || dag.some((e) => num(trafficOf(e).p99Ms) !== undefined || num(trafficOf(e).p50Ms) !== undefined);
  let worstPath: PathResult | null = null;
  if (hasLatency) {
    const best = new Map<string, PathResult>();
    const own = (n: CNode) => ({ p99: res[n.id].p99Ms ?? 0, p50: res[n.id].p50Ms ?? 0, miss: num(capOf(n).p99Ms) === undefined && !(opts.assumeDefaults && defOf(n)) });
    for (const v of [...order].reverse()) {
      const n = byId.get(v)!;
      const o = own(n);
      if (chaosOf(v) === 'down') { best.set(v, { nodeIds: [v], edgeIds: [], p50Ms: 0, p99Ms: 0, incomplete: false, broken: true }); continue; }
      let tail: PathResult = { nodeIds: [], edgeIds: [], p50Ms: 0, p99Ms: 0, incomplete: false };
      for (const e of dagOut.get(v)!) {
        const sub =best.get(e.target)!;
        const t = trafficOf(e);
        const cand: PathResult = { nodeIds: sub.nodeIds, edgeIds: [e.id, ...sub.edgeIds], p50Ms: sub.p50Ms + (num(t.p50Ms) ?? 0) + (retryMs.get(e.id) ?? 0), p99Ms: sub.p99Ms + (num(t.p99Ms) ?? 0) + (retryMs.get(e.id) ?? 0), incomplete: sub.incomplete || num(t.p99Ms) === undefined, ...(sub.broken ? { broken: true } : {}) };
        // a healthy path beats a broken one; among equals the larger p99 wins
        const better = tail.nodeIds.length === 0 && tail.edgeIds.length === 0 ? true : !!tail.broken !== !!cand.broken ? !cand.broken : cand.p99Ms > tail.p99Ms;
        if (better || tail.nodeIds.length === 0 && tail.edgeIds.length === 0 && sub.nodeIds.length) tail = cand;
      }
      best.set(v, { nodeIds: [v, ...tail.nodeIds], edgeIds: tail.edgeIds, p50Ms: tail.p50Ms + o.p50, p99Ms: tail.p99Ms + o.p99, incomplete: tail.incomplete || o.miss, ...(tail.broken ? { broken: true } : {}) });
    }
    const entries = nodes.filter((n) => isEntry(n.id)).map((n) => best.get(n.id)!);
    worstPath = entries.sort((a, b) => Number(!!a.broken) - Number(!!b.broken) || b.p99Ms - a.p99Ms || (a.nodeIds[0] < b.nodeIds[0] ? -1 : 1))[0] ?? null;
    if (worstPath && !worstPath.broken && worstPath.p99Ms === 0 && worstPath.p50Ms === 0) worstPath = null;
    if (worstPath && !worstPath.broken) {
      const hops = [
        ...worstPath.nodeIds.map((id) => ({ p50: res[id].p50Ms ?? 0, p99: res[id].p99Ms ?? 0 })),
        ...worstPath.edgeIds.map((id) => { const t = trafficOf(edges.find((e) => e.id === id)!); return { p50: (num(t.p50Ms) ?? 0) + (retryMs.get(id) ?? 0), p99: (num(t.p99Ms) ?? 0) + (retryMs.get(id) ?? 0) }; }),
      ];
      worstPath.p99EstMs = Math.min(worstPath.p99Ms, worstPath.p50Ms + Math.sqrt(hops.reduce((a, h) => a + Math.max(0, h.p99 - h.p50) ** 2, 0)));
    }
  }

  // every path is cut by a down node: nothing is served, so there is no latency to report
  totals.p99Ms = worstPath && !worstPath.broken ? worstPath.p99Ms : 0;

  // availability: weakest entry-to-leaf path (product of node availabilities), then the dropped share
  const linked = new Set(dag.flatMap((e) => [e.source, e.target]));
  const pathAv = new Map<string, number>();
  for (const v of [...order].reverse()) {
    const outs = dagOut.get(v)!;
    pathAv.set(v, res[v].availability * (outs.length ? Math.min(...outs.map((e) => pathAv.get(e.target)!)) : 1));
  }
  const entryIds = nodes.filter((n) => linked.has(n.id) && isEntry(n.id)).map((n) => n.id);
  const loaded = entryIds.filter((id) => ownRps(id) > 0);
  const roots = loaded.length ? loaded : entryIds;
  const pathMin = roots.length ? Math.min(...roots.map((id) => pathAv.get(id)!)) : nodes.length ? Math.min(...nodes.map((n) => res[n.id].availability)) : 1;
  totals.availability = Math.max(0, pathMin * (1 - droppedPct / 100));

  if (retryStorm) {
    totals.retryStorm = true;
    warnings.push('Retry storm: retries keep raising the load on an overloaded node, the system does not settle');
  }

  const budget = num(opts.budgetUsd);
  if (budget !== undefined && budget > 0) {
    totals.budgetUsd = budget;
    if (totals.costUsdMonth > budget) { totals.overBudget = true; warnings.push(`Estimated cost $${Math.round(totals.costUsdMonth).toLocaleString('en-US')}/mo is above the budget of $${Math.round(budget).toLocaleString('en-US')}/mo`); }
  }

  return {
    nodes: res, edges: edgeRes, bottlenecks, worstPath, totals, warnings: [...new Set(warnings)],
    priceTableDate: PRICE_TABLE_DATE,
    priceSources: priceSources(usedProviders.size ? usedProviders : undefined),
    disclaimer: 'Rough estimate from provider list prices (on-demand, one region, no discounts, no tax); check the provider calculator before budgeting.',
  };
}
export { PRICES, PRICE_TABLE_DATE, DEFAULT_SKU_BY_ICON, priceSources, describePriceSource } from './prices';

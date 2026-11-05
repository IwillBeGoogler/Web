import type { DiagramEdge, DiagramNode } from '../../types';
import { computeRoutes, createRouteCache, type Route, type RoutingOptions } from './index';

/**
 * Edge routing off the main thread. `createRoutingEngine` is the body of the worker (`worker.ts`): it owns the incremental
 * route cache and answers each request with only the routes that changed since its previous reply. `RoutingService` is the
 * client: it keeps a mirror of the routes, coalesces requests (only the newest is answered) and falls back to routing on
 * the calling thread when there is no Worker (jsdom, tests, very old browsers) or the worker fails.
 */

export type WireOptions = Omit<RoutingOptions, 'now'>;
export interface RoutingRequest {
  id: number;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  opts: WireOptions;
}
export interface RoutingReply {
  id: number;
  /** true when `routes` is the complete set (first reply / after a reset) */
  full: boolean;
  routes: [string, Route][];
  removed: string[];
  recomputed: number;
  reused: number;
}

export function createRoutingEngine() {
  let cache = createRouteCache();
  let sent = new Map<string, Route>();
  return {
    run(req: RoutingRequest): RoutingReply {
      const routes = computeRoutes(req.nodes, req.edges, req.opts, cache);
      const full = sent.size === 0;
      const changed: [string, Route][] = [];
      for (const [id, r] of routes) if (sent.get(id) !== r) changed.push([id, r]);
      const removed: string[] = [];
      for (const id of sent.keys()) if (!routes.has(id)) removed.push(id);
      sent = new Map(routes);
      return { id: req.id, full, routes: changed, removed, recomputed: cache.recomputed, reused: cache.reused };
    },
    reset() {
      cache = createRouteCache();
      sent = new Map();
    },
  };
}

/** the slice of `Worker` the service needs (a fake in tests) */
export interface WorkerLike {
  postMessage(msg: unknown): void;
  onmessage: ((ev: MessageEvent<RoutingReply>) => void) | null;
  onerror: ((ev: ErrorEvent) => void) | null;
  terminate(): void;
}

export const defaultWorkerFactory = (): WorkerLike | null => {
  if (typeof Worker === 'undefined') return null;
  try {
    return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' }) as unknown as WorkerLike;
  } catch {
    return null;
  }
};

interface Pending {
  req: RoutingRequest;
  resolve: (r: Map<string, Route> | null) => void;
}

export class RoutingService {
  private worker: WorkerLike | null;
  private mirror = new Map<string, Route>();
  private seq = 0;
  private inFlight: Pending | null = null;
  private queued: Pending | null = null;
  private sync = createRoutingEngine();
  private syncMirror = new Map<string, Route>();
  constructor(factory: () => WorkerLike | null = defaultWorkerFactory) {
    this.worker = factory();
    if (this.worker) {
      this.worker.onmessage = (ev) => this.onReply(ev.data);
      this.worker.onerror = () => this.fallBack();
    }
  }

  get hasWorker(): boolean {
    return this.worker !== null;
  }

  /** Routes for this snapshot, or `null` when a newer request superseded it. */
  request(nodes: DiagramNode[], edges: DiagramEdge[], opts: RoutingOptions): Promise<Map<string, Route> | null> {
    const { now: _now, ...wire } = opts;
    void _now;
    const req: RoutingRequest = { id: ++this.seq, nodes, edges, opts: wire };
    if (!this.worker) return Promise.resolve(this.runSync(req));
    return new Promise((resolve) => {
      if (this.queued) this.queued.resolve(null);
      this.queued = { req, resolve };
      this.pump();
    });
  }

  private runSync(req: RoutingRequest): Map<string, Route> {
    this.apply(this.sync.run(req), this.syncMirror);
    return new Map(this.syncMirror);
  }

  private pump(): void {
    if (this.inFlight || !this.queued || !this.worker) return;
    this.inFlight = this.queued;
    this.queued = null;
    this.worker.postMessage(this.inFlight.req);
  }

  private apply(reply: RoutingReply, into: Map<string, Route>): void {
    if (reply.full) into.clear();
    for (const id of reply.removed) into.delete(id);
    for (const [id, r] of reply.routes) into.set(id, r);
  }

  private onReply(reply: RoutingReply): void {
    this.apply(reply, this.mirror); // every reply is a delta on the previous one: never skip one
    const cur = this.inFlight;
    this.inFlight = null;
    if (cur && cur.req.id === reply.id) cur.resolve(this.queued ? null : new Map(this.mirror)); // a newer request is waiting: this answer is already stale
    this.pump();
  }

  private fallBack(): void {
    this.worker?.terminate();
    this.worker = null;
    const pending = [this.inFlight, this.queued].filter((p): p is Pending => !!p);
    this.inFlight = null;
    this.queued = null;
    const last = pending[pending.length - 1];
    for (const p of pending) p.resolve(p === last ? this.runSync(p.req) : null);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.queued?.resolve(null);
    this.inFlight?.resolve(null);
    this.queued = this.inFlight = null;
  }
}

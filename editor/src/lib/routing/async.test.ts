import { describe, expect, it } from 'vitest';
import { computeRoutes, DEFAULT_ROUTING, type RoutingOptions } from './index';
import { createRoutingEngine, RoutingService, type RoutingReply, type RoutingRequest, type WorkerLike } from './async';
import { resolveSettings } from '../settings';
import { makeBenchPage } from '../bench/fixture';

// The route search gives up after `budgetMs` of WALL-CLOCK time (and falls back to a stepped route). These tests compare the routes of two
// runs (direct vs through the service), so under CPU load (many workers) one run could give up and the other not. No deadline: the
// result then depends on the input only.
const opts: RoutingOptions = { ...DEFAULT_ROUTING, budgetMs: 1e9, edgeDefaults: resolveSettings(undefined, undefined).edge };

/** a worker that runs the engine in-process, answering on a later microtask like a real one */
function fakeWorker(): WorkerLike & { posted: number } {
  const engine = createRoutingEngine();
  const w: WorkerLike & { posted: number } = {
    posted: 0,
    onmessage: null,
    onerror: null,
    postMessage(msg: unknown) {
      w.posted++;
      const reply = engine.run(msg as RoutingRequest);
      queueMicrotask(() => w.onmessage?.({ data: structuredClone(reply) } as MessageEvent<RoutingReply>));
    },
    terminate() {},
  };
  return w;
}

const mapOf = (m: Map<string, unknown>) => JSON.stringify([...m].sort(([a], [b]) => a.localeCompare(b)));

describe('routing engine (the worker body)', () => {
  const page = makeBenchPage(60);
  it('first reply is full, a later one carries only the routes that changed', () => {
    const engine = createRoutingEngine();
    const a = engine.run({ id: 1, nodes: page.nodes, edges: page.edges, opts });
    expect(a.full).toBe(true);
    expect(a.routes.length).toBe(page.edges.length);
    const moved = page.nodes.map((n) => (n.id === 'n20' ? { ...n, position: { x: n.position.x + 40, y: n.position.y + 20 } } : n));
    const b = engine.run({ id: 2, nodes: moved, edges: page.edges, opts });
    expect(b.full).toBe(false);
    expect(b.routes.length).toBeGreaterThan(0);
    expect(b.routes.length).toBeLessThan(page.edges.length / 2);
  });
  it('reports removed edges', () => {
    const engine = createRoutingEngine();
    engine.run({ id: 1, nodes: page.nodes, edges: page.edges, opts });
    const r = engine.run({ id: 2, nodes: page.nodes, edges: page.edges.slice(1), opts });
    expect(r.removed).toEqual([page.edges[0].id]);
  });
});

describe('RoutingService', () => {
  const page = makeBenchPage(80);
  const direct = computeRoutes(page.nodes, page.edges, opts);

  it('without a Worker it computes synchronously and gives the same routes', async () => {
    const svc = new RoutingService(() => null);
    expect(svc.hasWorker).toBe(false);
    const r = await svc.request(page.nodes, page.edges, opts);
    expect(mapOf(r!)).toBe(mapOf(direct));
  });
  it('through a worker it reproduces the direct result, including after an incremental update', async () => {
    const w = fakeWorker();
    const svc = new RoutingService(() => w);
    expect(svc.hasWorker).toBe(true);
    const r1 = await svc.request(page.nodes, page.edges, opts);
    expect(mapOf(r1!)).toBe(mapOf(direct));
    const moved = page.nodes.map((n) => (n.id === 'n30' ? { ...n, position: { x: n.position.x + 33, y: n.position.y - 20 } } : n));
    const r2 = await svc.request(moved, page.edges, opts);
    expect(mapOf(r2!)).toBe(mapOf(computeRoutes(moved, page.edges, opts)));
    // unchanged routes keep their identity (no re-render of untouched edges)
    const same = [...r2!].filter(([id, r]) => r1!.get(id) === r).length;
    expect(same).toBeGreaterThan(page.edges.length / 2);
  });
  it('a superseded request resolves to null; the latest wins and the mirror stays consistent', async () => {
    const w = fakeWorker();
    const svc = new RoutingService(() => w);
    const moved = page.nodes.map((n) => (n.id === 'n5' ? { ...n, position: { x: n.position.x + 70, y: n.position.y } } : n));
    const p1 = svc.request(page.nodes, page.edges, opts);
    const p2 = svc.request(moved, page.edges, opts);
    const [a, b] = await Promise.all([p1, p2]);
    expect(a).toBeNull();
    expect(mapOf(b!)).toBe(mapOf(computeRoutes(moved, page.edges, opts)));
  });
  it('a worker error falls back to synchronous routing', async () => {
    const w = fakeWorker();
    const svc = new RoutingService(() => w);
    const p = svc.request(page.nodes, page.edges, opts);
    w.onerror?.({ message: 'boom' } as ErrorEvent);
    const r = await p;
    expect(svc.hasWorker).toBe(false);
    expect(mapOf(r!)).toBe(mapOf(direct));
  });
});

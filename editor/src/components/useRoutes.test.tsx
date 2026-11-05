import { describe, expect, it } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useRoutes, WORKER_EDGE_THRESHOLD } from './useRoutes';
import { DEFAULT_ROUTING, computeRoutes } from '../lib/routing';
import { resolveSettings } from '../lib/settings';
import { makeBenchPage } from '../lib/bench/fixture';
import { RoutingService, createRoutingEngine, type RoutingReply, type WorkerLike } from '../lib/routing/async';

// no wall-clock deadline: the route search gives up after budgetMs of real time, so under CPU load a run could differ from another
const opts = { ...DEFAULT_ROUTING, budgetMs: 1e9, edgeDefaults: resolveSettings(undefined, undefined).edge };

describe('useRoutes', () => {
  it('small pages route synchronously (first render already has every route)', () => {
    const page = makeBenchPage(20);
    const { result } = renderHook(() => useRoutes(page.nodes, page.edges, opts));
    expect(result.current.size).toBe(page.edges.length);
  });
  it('large pages route through the service; routes arrive after the first render', async () => {
    const page = makeBenchPage(Math.ceil((WORKER_EDGE_THRESHOLD * 1.2) / 2.4) + 50);
    expect(page.edges.length).toBeGreaterThan(WORKER_EDGE_THRESHOLD);
    const engine = createRoutingEngine();
    const worker: WorkerLike = {
      onmessage: null,
      onerror: null,
      postMessage(msg) {
        const reply = engine.run(msg as never);
        queueMicrotask(() => worker.onmessage?.({ data: reply } as MessageEvent<RoutingReply>));
      },
      terminate() {},
    };
    const service = new RoutingService(() => worker);
    const { result } = renderHook(() => useRoutes(page.nodes, page.edges, opts, service));
    expect(result.current.size).toBe(0);
    await waitFor(() => expect(result.current.size).toBe(page.edges.length), { timeout: 30_000 }); // routing ~1000 edges takes seconds on a loaded machine
    expect(JSON.stringify([...result.current.values()][0])).toBe(JSON.stringify(computeRoutes(page.nodes, page.edges, opts).get(page.edges[0].id)));
  }, 30_000); // the test's own timeout (default 5 s) capped the waitFor above: the work is ~4 s alone, ~7.5 s when the whole suite competes for the CPU
});

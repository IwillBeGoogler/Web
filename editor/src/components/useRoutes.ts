import { useEffect, useMemo, useRef, useState } from 'react';
import type { DiagramEdge, DiagramNode } from '../types';
import { computeRoutes, createRouteCache, type Route, type RoutingOptions } from '../lib/routing';
import { RoutingService } from '../lib/routing/async';

/** Up to this many edges routing runs on the main thread (a drag frame stays under 16 ms); above it moves to a Web Worker. */
export const WORKER_EDGE_THRESHOLD = 600;
const EMPTY = new Map<string, Route>();

let shared: RoutingService | null = null;
const sharedService = () => (shared ??= new RoutingService());

/**
 * Routes for the page. Small pages are routed synchronously with the incremental cache (so the first paint is complete);
 * large ones are routed in a worker: the previous routes stay on screen until the new ones arrive, and unchanged routes keep
 * their object identity. Without a Worker (jsdom, tests) the service routes synchronously on this thread.
 */
export function useRoutes(nodes: DiagramNode[], edges: DiagramEdge[], opts: RoutingOptions, service?: RoutingService): Map<string, Route> {
  const big = edges.length > WORKER_EDGE_THRESHOLD;
  const cache = useRef(createRouteCache());
  const syncRoutes = useMemo(() => (big ? EMPTY : computeRoutes(nodes, edges, opts, cache.current)), [big, nodes, edges, opts]);
  const [asyncRoutes, setAsync] = useState<Map<string, Route>>(EMPTY);
  useEffect(() => {
    if (!big) return;
    let live = true;
    void (service ?? sharedService()).request(nodes, edges, opts).then((r) => {
      if (live && r) setAsync(r);
    });
    return () => {
      live = false;
    };
  }, [big, nodes, edges, opts, service]);
  return big ? asyncRoutes : syncRoutes;
}

// Times computeRoutes on the benchmark fixture (node, no browser):  node scripts/bench-routing.mjs [nodes=5000]
import { createServer } from 'vite';

const n = Number(process.argv[2] ?? 5000);
const vite = await createServer({ server: { middlewareMode: true, hmr: false, watch: null }, appType: 'custom', logLevel: 'error' });
try {
  const { makeBenchPage } = await vite.ssrLoadModule('/src/lib/bench/fixture.ts');
  const { computeRoutes, createRouteCache, DEFAULT_ROUTING } = await vite.ssrLoadModule('/src/lib/routing/index.ts');
  const { resolveSettings } = await vite.ssrLoadModule('/src/lib/settings.ts');
  const page = makeBenchPage(n);
  const opts = { ...DEFAULT_ROUTING, edgeDefaults: resolveSettings(undefined, undefined).edge };
  const cache = createRouteCache();
  let t = performance.now();
  const routes = computeRoutes(page.nodes, page.edges, opts, cache);
  console.log(`${n} nodes / ${page.edges.length} edges: first full layout ${(performance.now() - t).toFixed(0)} ms (${routes.size} routes, ${[...routes.values()].filter((r) => r.routed).length} obstacle-routed)`);
  let nodes = page.nodes;
  const times = [];
  for (let i = 0; i < 10; i++) {
    nodes = nodes.map((x) => (x.id === 'n150' ? { ...x, position: { x: x.position.x + 9 * (i + 1), y: x.position.y + 5 } } : x));
    t = performance.now();
    computeRoutes(nodes, page.edges, opts, cache);
    times.push(performance.now() - t);
  }
  console.log(`one node dragged (incremental): median ${times.sort((a, b) => a - b)[5].toFixed(1)} ms, reused ${cache.reused}, recomputed ${cache.recomputed}`);
} finally {
  await vite.close();
}

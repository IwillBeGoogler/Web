import type { DiagramEdge, DiagramNode, Page, Project } from '../../types';

/** Benchmark sizes used by the Playwright perf test (`e2e/perf.spec.ts`) and `npm run bench:fixture`. */
export const BENCH_SIZES = [5000, 10000];
/**
 * The editor keeps every open file in the browser's localStorage (about 5 MB per origin, and a failed write is swallowed). The dense
 * layout of 10k nodes is ~2.5 MB of JSON and does not fit, so pages above this size get fewer edges (right neighbour + every other node below).
 */
export const SPARSE_ABOVE = 8000;

const ICONS = ['postgresql', 'redis', 'nginx', 'kafka', 'docker', 'kubernetes', 'prometheus', 'grafana'];

/**
 * A deterministic diagram of `n` icon nodes on a grid (clusters of 10 columns separated by wider gutters) and about
 * 2.5 edges per node: right neighbour, the node below, a short diagonal hop every third node and a long hop every 11th. Layouts like this
 * are the worst realistic case for routing (many short edges, dense obstacles).
 */
export function makeBenchPage(n: number, name = `Bench ${n}`, sparse = n > SPARSE_ABOVE): Page {
  const cols = Math.ceil(Math.sqrt(n * 1.6));
  const nodes: DiagramNode[] = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    nodes.push({
      id: `n${i}`,
      type: 'icon',
      position: { x: c * 190 + Math.floor(c / 10) * 60, y: r * 150 + Math.floor(r / 10) * 60 },
      data: { label: `Service ${i}`, iconId: ICONS[i % ICONS.length] },
    });
  }
  const edges: DiagramEdge[] = [];
  const add = (a: number, b: number) => {
    if (b < 0 || b >= n || a === b) return;
    edges.push({ id: `e${edges.length}`, source: `n${a}`, target: `n${b}`, data: {} } as DiagramEdge);
  };
  for (let i = 0; i < n; i++) {
    if ((i % cols) + 1 < cols) add(i, i + 1);
    if (sparse) {
      if (i % 2 === 0) add(i, i + cols);
      if (i % 11 === 0) add(i, i + 3 * cols + 7);
      continue;
    }
    add(i, i + cols);
    if (i % 3 === 0 && (i % cols) + 1 < cols) add(i, i + cols + 1);
    if (i % 11 === 0) add(i, i + 3 * cols + 7); // a longer hop now and then: these need real obstacle-avoiding routes
  }
  return { id: 'pg_bench', name, nodes, edges };
}

export function makeBenchProject(n: number, now = 1_700_000_000_000): Project {
  const page = makeBenchPage(n);
  return { version: 2, id: `prj_bench_${n}`, name: `Bench ${n}`, createdAt: now, updatedAt: now, activePageId: page.id, pages: [page] };
}

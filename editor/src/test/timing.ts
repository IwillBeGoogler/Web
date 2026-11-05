/**
 * Wall-clock budgets in tests: the cost of one run is `min` over several runs after a warm-up. A mean, or a single cold run,
 * measures the machine's load (12 jsdom workers, JIT warm-up, GC), not the code; the fastest run is the one nothing interrupted.
 */
export function bestMs(fn: () => void, runs = 8, warmup = 2): number {
  for (let i = 0; i < warmup; i++) fn();
  let best = Infinity;
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    best = Math.min(best, performance.now() - t0);
  }
  return best;
}

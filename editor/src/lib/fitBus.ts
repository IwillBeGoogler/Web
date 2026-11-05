/** Tiny bus so store code (no React Flow access) can ask the canvas to fit some nodes into view. */
type Listener = (ids: string[]) => void;
const listeners = new Set<Listener>();

export function onFitRequest(cb: Listener): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

/** Ask for a fit of these nodes once they have been rendered (two frames later). No listener (tests, SSR) = no-op. */
export function requestFit(ids: string[]): void {
  if (!ids.length || !listeners.size) return;
  const run = (): void => listeners.forEach((l) => l(ids));
  if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => requestAnimationFrame(run));
  else run();
}

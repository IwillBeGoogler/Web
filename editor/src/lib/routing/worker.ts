/// <reference lib="webworker" />
import { createRoutingEngine, type RoutingRequest } from './async';

// Worker entry (bundled by Vite through `new Worker(new URL('./worker.ts', import.meta.url))` in async.ts).
const engine = createRoutingEngine();
self.onmessage = (ev: MessageEvent<RoutingRequest>) => {
  (self as unknown as { postMessage(m: unknown): void }).postMessage(engine.run(ev.data));
};

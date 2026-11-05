import '@testing-library/jest-dom/vitest';

// jsdom lacks these; React Flow needs them.
class RO {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as unknown as { ResizeObserver: typeof RO }).ResizeObserver = RO;
(globalThis as unknown as { DOMMatrixReadOnly: unknown }).DOMMatrixReadOnly = class {
  m22 = 1;
  constructor(_t?: string) {}
};

// jsdom lacks matchMedia (used by motion + theme hooks)
if (!window.matchMedia) {
  window.matchMedia = ((query: string) => ({
    matches: false, media: query, onchange: null,
    addEventListener: () => undefined, removeEventListener: () => undefined,
    addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom: Blob.arrayBuffer / File.arrayBuffer
if (!Blob.prototype.arrayBuffer) {
  Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result as ArrayBuffer);
      r.onerror = () => reject(r.error);
      r.readAsArrayBuffer(this);
    });
  };
}

// jsdom has no canvas: keep getContext quiet (returns null)
HTMLCanvasElement.prototype.getContext = (() => null) as never;

// the app starts on the landing page at "/"; existing UI tests exercise the projects dashboard
import { beforeEach } from 'vitest';
import { useSession } from '../api/session';
beforeEach(() => {
  window.history.replaceState({}, '', '/projects');
  // no backend in unit tests: skip the /auth/config probe (App only probes while the mode is 'checking')
  useSession.getState().reset();
  useSession.setState({ mode: 'local' });
});

// jsdom lacks IntersectionObserver (motion whileInView, hero visibility)
if (!('IntersectionObserver' in globalThis)) {
  (globalThis as unknown as { IntersectionObserver: unknown }).IntersectionObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords() { return []; }
  };
}

// dialogs are module-level state: never leak a pending dialog (and its promise) into the next test
import { afterEach } from 'vitest';
import { useDialogStore } from '../lib/dialogs';
afterEach(() => useDialogStore.getState().clear());

// Edge routing gives up after `budgetMs` of WALL-CLOCK time and falls back to a stepped route, so with many jsdom workers sharing the CPU
// the same input can route differently from run to run. Tests assert on geometry, not on speed (speed tests use `bestMs`): no deadline.
import { DEFAULT_ROUTING } from '../lib/routing';
DEFAULT_ROUTING.budgetMs = 1e9;

// no test talks to a real broker: links without their own `connect` get an inert mock client
import { setMqttConnect } from '../realtime/link';
import { MockMqttClient } from '../realtime/mockMqtt';
setMqttConnect((url, opts) => new MockMqttClient(url, opts));

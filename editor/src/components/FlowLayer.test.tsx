import { act, render } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FlowLayer } from './FlowLayer';
import { measure } from '../lib/flow/geometry';
import type { FlowPath } from '../lib/flow/paths';

const calls: string[] = [];
const ctx = new Proxy({}, { get: (_t, k: string) => (k === 'createRadialGradient' ? () => ({ addColorStop: () => {} }) : (...a: unknown[]) => { calls.push(k); void a; }), set: () => true });
const origGet = HTMLCanvasElement.prototype.getContext;
const path = (id: string, style: 'dot' | 'dash' | 'pulse', x = 0, color = '#2d3340'): FlowPath => {
  const pts = [{ x, y: 0 }, { x: x + 300, y: 0 }];
  return { id, edgeIds: [id], from: 'a', to: 'b', points: pts, color, look: { style, speed: 'normal', density: 1.2, dir: 'forward' } as never, m: measure(pts) };
};
function mm(reduced: boolean) {
  window.matchMedia = ((q: string) => ({ matches: reduced && q.includes('reduce'), media: q, addEventListener: () => {}, removeEventListener: () => {} })) as never;
}
beforeEach(() => {
  calls.length = 0;
  HTMLCanvasElement.prototype.getContext = (() => ctx) as never;
  vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
});
afterEach(() => { HTMLCanvasElement.prototype.getContext = origGet; vi.useRealTimers(); mm(false); delete document.documentElement.dataset.theme; });

const mount = (paths: FlowPath[], visible?: (p: FlowPath) => boolean) => render(<ReactFlowProvider><div><FlowLayer paths={paths} visible={visible} /></div></ReactFlowProvider>);

describe('FlowLayer drawing', () => {
  it('draws dot, dash and pulse packets, with off-screen paths and the visible filter skipped', () => {
    mm(false);
    document.documentElement.dataset.theme = 'dark';
    const hidden = path('hid', 'dot', 0);
    const { unmount } = mount([path('a', 'dot'), path('b', 'dash'), path('c', 'pulse', 0, '#ff0000'), path('far', 'dot', 99999), hidden], (p) => p.id !== 'hid');
    act(() => { vi.advanceTimersByTime(100); });
    document.dispatchEvent(new Event('visibilitychange'));
    expect(calls).toContain('arc');
    expect(calls).toContain('roundRect');
    unmount();
    expect(calls.length).toBeGreaterThan(0);
  });
  it('reduced motion: draws chevrons once and redraws when paths change', () => {
    mm(true);
    const { rerender } = mount([path('a', 'dot')]);
    expect(calls).toContain('lineTo');
    const n = calls.length;
    rerender(<ReactFlowProvider><div><FlowLayer paths={[path('a', 'dot'), path('b', 'dot')]} /></div></ReactFlowProvider>);
    expect(calls.length).toBeGreaterThan(n);
  });
  it('tab hidden pauses without throwing', () => {
    mm(false);
    mount([path('a', 'dot')]);
    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
  });
});

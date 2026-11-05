import { describe, expect, it } from 'vitest';
import { SceneLoop } from './sceneLoop';

function harness(reducedMotion = false) {
  let next = 1;
  const pending = new Map<number, (t: number) => void>();
  const rendered: number[] = [];
  const loop = new SceneLoop({
    raf: (cb) => { const id = next++; pending.set(id, cb); return id; },
    caf: (id) => void pending.delete(id),
    render: (t) => void rendered.push(t),
    reducedMotion,
  });
  const frame = (ms: number) => { const [id, cb] = [...pending][0] ?? []; if (id === undefined) return false; pending.delete(id); cb(ms); return true; };
  return { loop, pending, rendered, frame };
}

describe('SceneLoop', () => {
  it('start schedules frames; stop cancels the pending one', () => {
    const h = harness();
    h.loop.start();
    expect(h.loop.running).toBe(true);
    expect(h.frame(1000)).toBe(true);
    expect(h.frame(1016)).toBe(true);
    expect(h.rendered).toEqual([0, 0.016]);
    h.loop.stop();
    expect(h.loop.running).toBe(false);
    expect(h.pending.size).toBe(0);
  });
  it('pauses when the tab is hidden and resumes when visible again', () => {
    const h = harness();
    h.loop.start();
    h.loop.setVisible(false);
    expect(h.loop.running).toBe(false);
    expect(h.pending.size).toBe(0);
    h.loop.setVisible(true);
    expect(h.loop.running).toBe(true);
    expect(h.pending.size).toBe(1);
  });
  it('pauses when the hero scrolls out of view (IntersectionObserver)', () => {
    const h = harness();
    h.loop.start();
    h.loop.setIntersecting(false);
    expect(h.pending.size).toBe(0);
    h.loop.setVisible(false);
    h.loop.setIntersecting(true);
    expect(h.loop.running).toBe(false); // still hidden
    h.loop.setVisible(true);
    expect(h.loop.running).toBe(true);
  });
  it('reduced motion: exactly one static frame, never a loop', () => {
    const h = harness(true);
    h.loop.start();
    expect(h.loop.running).toBe(false);
    expect(h.pending.size).toBe(0);
    expect(h.rendered).toEqual([0]);
    h.loop.setVisible(false);
    h.loop.setVisible(true);
    h.loop.setIntersecting(true);
    expect(h.pending.size).toBe(0);
    h.loop.still(); // e.g. resize
    expect(h.loop.frames).toBe(2);
  });
  it('does not double-schedule and stops cleanly mid-frame', () => {
    const h = harness();
    h.loop.start();
    h.loop.start();
    h.loop.setIntersecting(true);
    expect(h.pending.size).toBe(1);
    h.loop.stop();
    h.frame(5);
    expect(h.rendered).toEqual([]);
  });
});

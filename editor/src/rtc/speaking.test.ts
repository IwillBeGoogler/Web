import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LevelMeter, SpeakingDetector, levelOf } from './speaking';

describe('levelOf (RMS of 8-bit time-domain samples)', () => {
  it('silence is 0, a full-scale square wave is ~1, a quiet signal is in between', () => {
    expect(levelOf(new Uint8Array(64).fill(128))).toBe(0);
    expect(levelOf(Uint8Array.from({ length: 64 }, (_, i) => (i % 2 ? 255 : 0)))).toBeGreaterThan(0.95);
    const quiet = levelOf(Uint8Array.from({ length: 64 }, (_, i) => 128 + (i % 2 ? 6 : -6)));
    expect(quiet).toBeGreaterThan(0.03);
    expect(quiet).toBeLessThan(0.06);
    expect(levelOf(new Uint8Array(0))).toBe(0);
  });
});

describe('SpeakingDetector (hysteresis: no flicker between words)', () => {
  it('turns on above the threshold, stays on through short pauses, off after the hold time', () => {
    const d = new SpeakingDetector({ threshold: 0.05, holdMs: 400 });
    expect(d.update(0.01, 0)).toBe(false);
    expect(d.update(0.2, 100)).toBe(true);
    expect(d.update(0.01, 300)).toBe(true); // 200 ms of quiet: still speaking
    expect(d.update(0.01, 480)).toBe(true);
    expect(d.update(0.01, 600)).toBe(false); // >400 ms since the last loud sample
    expect(d.update(0.2, 700)).toBe(true);
  });
  it('muted: never speaking, whatever the level', () => {
    const d = new SpeakingDetector({ threshold: 0.05, holdMs: 400 });
    d.setMuted(true);
    expect(d.update(0.9, 0)).toBe(false);
    d.setMuted(false);
    expect(d.update(0.9, 10)).toBe(true);
    d.setMuted(true);
    expect(d.update(0.9, 20)).toBe(false);
  });
});

describe('LevelMeter (Web Audio analyser)', () => {
  let level = 128;
  class FakeAnalyser {
    fftSize = 0;
    getByteTimeDomainData(a: Uint8Array) {
      for (let i = 0; i < a.length; i++) a[i] = i % 2 ? level + 60 : level - 60;
    }
  }
  class FakeCtx {
    state = 'running';
    closed = false;
    createAnalyser = () => new FakeAnalyser();
    createMediaStreamSource = () => ({ connect: vi.fn(), disconnect: vi.fn() });
    resume = vi.fn(async () => undefined);
    close = vi.fn(async () => void (this.closed = true));
  }
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('reports speaking changes while the stream is loud and stops cleanly', async () => {
    const changes: boolean[] = [];
    let ctx!: FakeCtx;
    const m = new LevelMeter({ AudioContext: function () { ctx = new FakeCtx(); return ctx; } as never, intervalMs: 50, threshold: 0.05, holdMs: 200, onChange: (s) => changes.push(s) });
    m.start({} as never);
    await vi.advanceTimersByTimeAsync(120);
    expect(changes).toEqual([true]);
    level = 128;
    // silence: the fake still gives +-60 swings; emulate by muting
    m.setMuted(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(changes).toEqual([true, false]);
    m.stop();
    expect(ctx.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(changes).toEqual([true, false]);
  });
  it('without Web Audio it does nothing and never throws', () => {
    const m = new LevelMeter({ AudioContext: undefined, onChange: () => undefined });
    expect(() => m.start({} as never)).not.toThrow();
    expect(() => m.stop()).not.toThrow();
  });
});

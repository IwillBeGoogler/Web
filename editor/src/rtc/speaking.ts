/** RMS (0..1) of 8-bit time-domain samples from an AnalyserNode */
export function levelOf(data: Uint8Array): number {
  if (!data.length) return 0;
  let sum = 0;
  for (let i = 0; i < data.length; i++) {
    const v = (data[i] - 128) / 128;
    sum += v * v;
  }
  return Math.sqrt(sum / data.length);
}

/** "is speaking" with hysteresis: on at once above the threshold, off only after `holdMs` of quiet (no flicker between words) */
export class SpeakingDetector {
  private on = false;
  private lastLoud = -Infinity;
  private muted = false;
  constructor(private o: { threshold: number; holdMs: number }) {}
  setMuted(m: boolean): void {
    this.muted = m;
    if (m) this.on = false;
  }
  update(level: number, now: number): boolean {
    if (this.muted) return (this.on = false);
    if (level >= this.o.threshold) {
      this.lastLoud = now;
      this.on = true;
    } else if (this.on && now - this.lastLoud > this.o.holdMs) this.on = false;
    return this.on;
  }
}

export interface LevelMeterOptions {
  AudioContext: (new () => AudioContextLike) | undefined;
  onChange: (speaking: boolean) => void;
  intervalMs?: number;
  threshold?: number;
  holdMs?: number;
}
interface AudioContextLike {
  state: string;
  createAnalyser(): { fftSize: number; getByteTimeDomainData(a: Uint8Array): void };
  createMediaStreamSource(s: MediaStream): { connect(n: unknown): void; disconnect(): void };
  resume(): Promise<void>;
  close(): Promise<void>;
}

/** watches a MediaStream's loudness and reports speaking / silent (drives the rings on avatars and cursors) */
export class LevelMeter {
  private ctx: AudioContextLike | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private det: SpeakingDetector;
  private last = false;
  constructor(private o: LevelMeterOptions) {
    this.det = new SpeakingDetector({ threshold: o.threshold ?? 0.04, holdMs: o.holdMs ?? 350 });
  }
  setMuted(m: boolean): void {
    this.det.setMuted(m);
  }
  start(stream: MediaStream): void {
    this.stop();
    const Ctx = this.o.AudioContext;
    if (!Ctx) return;
    try {
      const ctx = new Ctx();
      this.ctx = ctx;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      ctx.createMediaStreamSource(stream).connect(analyser);
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      const buf = new Uint8Array(512);
      this.timer = setInterval(() => {
        analyser.getByteTimeDomainData(buf);
        const speaking = this.det.update(levelOf(buf), Date.now());
        if (speaking !== this.last) {
          this.last = speaking;
          this.o.onChange(speaking);
        }
      }, this.o.intervalMs ?? 80);
    } catch {
      this.stop();
    }
  }
  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const c = this.ctx;
    this.ctx = null;
    if (c) void c.close().catch(() => undefined);
    if (this.last) {
      this.last = false;
      this.o.onChange(false);
    }
  }
}

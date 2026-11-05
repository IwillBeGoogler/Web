/**
 * Render-loop controller for the hero scene (pure logic, no three.js): the loop runs only while the tab is visible AND the hero is on screen,
 * and never when the user prefers reduced motion (then a single static frame is drawn instead).
 */
export interface LoopDeps {
  raf: (cb: (t: number) => void) => number;
  caf: (id: number) => void;
  /** draw one frame; `t` is the time in seconds since start */
  render: (t: number) => void;
  reducedMotion: boolean;
}

export class SceneLoop {
  private visible = true;
  private onScreen = true;
  private started = false;
  private id: number | null = null;
  private t0: number | null = null;
  frames = 0;

  constructor(private deps: LoopDeps) {}

  get running(): boolean {
    return this.id !== null;
  }
  private get shouldRun(): boolean {
    return this.started && this.visible && this.onScreen && !this.deps.reducedMotion;
  }

  start(): void {
    this.started = true;
    if (this.deps.reducedMotion) this.still();
    this.sync();
  }
  stop(): void {
    this.started = false;
    this.sync();
  }
  setVisible(v: boolean): void {
    this.visible = v;
    this.sync();
  }
  setIntersecting(v: boolean): void {
    this.onScreen = v;
    this.sync();
  }
  /** one static frame (reduced motion, resize, texture arrival) */
  still(): void {
    this.deps.render(0);
    this.frames++;
  }

  private sync(): void {
    if (this.shouldRun && this.id === null) {
      this.t0 = null;
      this.id = this.deps.raf(this.tick);
    } else if (!this.shouldRun && this.id !== null) {
      this.deps.caf(this.id);
      this.id = null;
    }
  }
  private tick = (ms: number): void => {
    this.id = null;
    if (!this.shouldRun) return;
    this.t0 ??= ms;
    this.deps.render((ms - this.t0) / 1000);
    this.frames++;
    if (this.shouldRun) this.id = this.deps.raf(this.tick);
  };
}

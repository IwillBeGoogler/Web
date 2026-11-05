import { animate } from "motion/react";

/** Length of one tremor, seconds. */
export const SHAKE_SECONDS = 1;
/** The page's own components; the fixed sky (Earth, sun, stars) stays put. */
const TARGETS = "header[data-chrome], #main, footer[data-chrome]";

/**
 * Decaying tremor: `n` jittery offsets in [-amp, amp] that fade out quadratically, starting and
 * ending at 0. Alternating signs keep it a shudder rather than a drift.
 */
export const rumble = (n: number, amp: number, rand: () => number = Math.random): number[] => {
  const out = [0];
  for (let i = 1; i < n - 1; i++) {
    const fade = (1 - i / (n - 1)) ** 2;
    out.push((i % 2 ? 1 : -1) * amp * fade * (0.55 + 0.45 * rand()));
  }
  out.push(0);
  return out;
};

let running: { els: HTMLElement[]; anims: ReturnType<typeof animate>[] } | null = null;

const clear = (els: HTMLElement[]) => {
  for (const el of els) el.style.removeProperty("transform");
};

/** A magnitude-three tremor: the header, page content and footer barely shiver; the sky does not move. */
export function shakePage() {
  if (running) return;
  const els = [...document.querySelectorAll<HTMLElement>(TARGETS)];
  if (!els.length) return;
  const x = rumble(22, 4);
  const y = rumble(22, 3);
  const anims = els.map((el) => animate(el, { x, y }, { duration: SHAKE_SECONDS, ease: "linear" }));
  running = { els, anims };
  Promise.all(anims).then(() => {
    clear(els);
    running = null;
  });
}

export function stopShake() {
  if (!running) return;
  for (const a of running.anims) a.stop();
  clear(running.els);
  running = null;
}

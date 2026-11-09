import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const stops: ReturnType<typeof vi.fn>[] = [];
let resolvers: (() => void)[] = [];
vi.mock("motion/react", () => ({
  animate: vi.fn(() => {
    const stop = vi.fn();
    stops.push(stop);
    const p = new Promise<void>((r) => resolvers.push(r)) as Promise<void> & { stop: () => void };
    p.stop = stop;
    return p;
  }),
}));

import { animate } from "motion/react";
import { rumble, SHAKE_SECONDS, shakePage, stopShake } from "./shake";

describe("rumble", () => {
  it("starts and ends at zero with n samples, fading and alternating", () => {
    const r = rumble(10, 4, () => 1);
    expect(r).toHaveLength(10);
    expect(r[0]).toBe(0);
    expect(r[9]).toBe(0);
    expect(r[1]).toBeGreaterThan(0);
    expect(r[2]).toBeLessThan(0);
    expect(Math.abs(r[1] ?? 0)).toBeGreaterThan(Math.abs(r[7] ?? 0));
    for (const v of r) expect(Math.abs(v)).toBeLessThanOrEqual(4);
  });
  it("defaults to Math.random", () => {
    expect(rumble(5, 2).every((v) => Math.abs(v) <= 2)).toBe(true);
  });
});

describe("shakePage / stopShake", () => {
  beforeEach(() => {
    stops.length = 0;
    resolvers = [];
    vi.mocked(animate).mockClear();
    document.body.innerHTML = '<header data-chrome></header><main id="main"></main><footer data-chrome></footer>';
  });
  afterEach(() => {
    stopShake();
    document.body.innerHTML = "";
  });

  it("does nothing without targets, and stopShake is idle-safe", () => {
    document.body.innerHTML = "";
    shakePage();
    stopShake();
    expect(animate).not.toHaveBeenCalled();
  });

  it("animates each target once, ignoring a second call while running, then clears", async () => {
    shakePage();
    shakePage();
    expect(animate).toHaveBeenCalledTimes(3);
    expect(vi.mocked(animate).mock.calls[0]?.[2]).toMatchObject({ duration: SHAKE_SECONDS });
    const main = document.getElementById("main") as HTMLElement;
    main.style.transform = "translateX(2px)";
    for (const r of resolvers) r();
    await vi.waitFor(() => expect(main.style.transform).toBe(""));
    shakePage(); // running reset: can shake again
    expect(animate).toHaveBeenCalledTimes(6);
  });

  it("stopShake halts animations and clears transforms", () => {
    shakePage();
    const main = document.getElementById("main") as HTMLElement;
    main.style.transform = "translateX(2px)";
    stopShake();
    expect(stops.every((s) => s.mock.calls.length === 1)).toBe(true);
    expect(main.style.transform).toBe("");
  });
});

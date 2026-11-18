import { afterEach, describe, expect, it, vi } from "vitest";
import { installStaleChunkRecovery, isStaleChunkError, reloadForStaleChunk } from "./staleChunk";

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("stale chunk recovery", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sessionStorage.clear();
  });

  it("recognises the browsers' failed-chunk messages only", () => {
    expect(isStaleChunkError(new TypeError("Failed to fetch dynamically imported module: https://x/assets/TopicsPage-abc.js"))).toBe(true);
    expect(isStaleChunkError(new TypeError("Importing a module script failed."))).toBe(true);
    expect(isStaleChunkError(new Error("error loading dynamically imported module"))).toBe(true);
    expect(isStaleChunkError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isStaleChunkError(null)).toBe(false);
  });

  it("reloads once, then not again within 30 s", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
    const st = store();
    const err = new TypeError("Failed to fetch dynamically imported module");
    expect(reloadForStaleChunk(err, st)).toBe(true);
    expect(reloadForStaleChunk(err, st)).toBe(false);
    expect(reloadForStaleChunk(new Error("boom"), store())).toBe(false);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("reloads even when storage throws or is undefined", () => {
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);
    const throwing = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {},
    };
    const err = new TypeError("Failed to fetch dynamically imported module");
    expect(reloadForStaleChunk(err, throwing)).toBe(true);
    expect(reloadForStaleChunk(err, undefined)).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);
  });

  it("recovers on vite:preloadError events", () => {
    vi.useFakeTimers();
    vi.setSystemTime(100_000);
    const reload = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({ ...window.location, reload } as Location);

    const listeners: EventListener[] = [];
    const origAdd = window.addEventListener.bind(window);
    vi.spyOn(window, "addEventListener").mockImplementation((type, fn, opts) => {
      if (type === "vite:preloadError" && typeof fn === "function") listeners.push(fn);
      return origAdd(type, fn, opts);
    });

    installStaleChunkRecovery();

    const nonStale = Object.assign(new Event("vite:preloadError", { cancelable: true }), { payload: new Error("other") });
    window.dispatchEvent(nonStale);
    expect(nonStale.defaultPrevented).toBe(false);

    const stale = Object.assign(new Event("vite:preloadError", { cancelable: true }), {
      payload: new Error("Unable to preload CSS for /assets/x.css"),
    });
    window.dispatchEvent(stale);
    expect(stale.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(1);

    // Advance past the 30s gap and dispatch without payload (fallback error message)
    vi.advanceTimersByTime(31_000);
    const noPayload = new Event("vite:preloadError", { cancelable: true });
    window.dispatchEvent(noPayload);
    expect(noPayload.defaultPrevented).toBe(true);
    expect(reload).toHaveBeenCalledTimes(2);

    for (const fn of listeners) window.removeEventListener("vite:preloadError", fn);
  });
});

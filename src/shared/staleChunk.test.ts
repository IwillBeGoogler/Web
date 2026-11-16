import { afterEach, describe, expect, it, vi } from "vitest";
import { isStaleChunkError, reloadForStaleChunk } from "./staleChunk";

const store = () => {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
};

describe("stale chunk recovery", () => {
  afterEach(() => vi.restoreAllMocks());

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
});

import { afterEach, describe, expect, it, vi } from "vitest";

const fresh = async () => {
  vi.resetModules();
  vi.doMock("@/shared/settingsSync", () => ({ settingsSync: { register: vi.fn(), push: vi.fn() } }));
  return import("./store");
};

describe("reading prefs store edges", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/shared/settingsSync");
    localStorage.clear();
  });

  it("migrates stored prefs to galaxy once", async () => {
    localStorage.setItem("iwillbegoogler.reading", JSON.stringify({ palette: "carbon" }));
    const { readingPrefs } = await fresh();
    expect(readingPrefs.get().palette).toBe("galaxy");
    expect(localStorage.getItem("iwillbegoogler.galaxy.v2")).toBe("1");
  });

  it("keeps stored prefs once migrated", async () => {
    localStorage.setItem("iwillbegoogler.reading", JSON.stringify({ palette: "carbon" }));
    localStorage.setItem("iwillbegoogler.galaxy.v2", "1");
    const { readingPrefs } = await fresh();
    expect(readingPrefs.get().palette).toBe("carbon");
  });

  it("defaults on corrupt storage", async () => {
    localStorage.setItem("iwillbegoogler.reading", "{bad");
    const { readingPrefs } = await fresh();
    expect(readingPrefs.get().palette).toBe("galaxy");
  });

  it("set/reset tolerate failing storage; subscribe unsubscribes", async () => {
    const { readingPrefs } = await fresh();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("x");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("x");
    });
    const fn = vi.fn();
    const off = readingPrefs.subscribe(fn);
    readingPrefs.set({ bold: true });
    readingPrefs.reset();
    off();
    readingPrefs.set({ bold: true });
    expect(fn).toHaveBeenCalledTimes(3 - 1);
  });

  it("uses full measure at max step", async () => {
    const { applyPrefs, readingPrefs } = await fresh();
    const root = document.createElement("div") as unknown as HTMLElement;
    applyPrefs({ ...readingPrefs.get(), measureStep: 99 }, root);
    expect(root.style.getPropertyValue("--article-measure")).toBe("100%");
  });

  it("registered setting get/apply", async () => {
    const reg = vi.fn();
    vi.resetModules();
    vi.doMock("@/shared/settingsSync", () => ({ settingsSync: { register: reg, push: vi.fn() } }));
    const { readingPrefs } = await import("./store");
    const s = reg.mock.calls[0]?.[0];
    localStorage.removeItem("iwillbegoogler.reading");
    expect(s.get()).toBeUndefined();
    localStorage.setItem("iwillbegoogler.reading", "{}");
    expect(s.get()).toBe(readingPrefs.get());
    const fn = vi.fn();
    readingPrefs.subscribe(fn);
    s.apply({ palette: "carbon" });
    expect(readingPrefs.get().palette).toBe("carbon");
    expect(fn).toHaveBeenCalled();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("x");
    });
    s.apply({ palette: "galaxy" });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("x");
    });
    expect(s.get()).toBeUndefined();
  });
});

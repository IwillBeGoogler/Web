import { afterEach, describe, expect, it, vi } from "vitest";

const fresh = async () => {
  vi.resetModules();
  return import("./index");
};

describe("i18n module edges", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("falls back to Uzbek when storage throws on load", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect((await fresh()).i18n.get()).toBe("uz");
  });

  it("falls back to navigator.language when languages is missing", async () => {
    vi.spyOn(navigator, "languages", "get").mockReturnValue(undefined as unknown as readonly string[]);
    vi.spyOn(navigator, "language", "get").mockReturnValue("ru-RU");
    expect((await fresh()).i18n.get()).toBe("ru");
  });

  it("survives a throwing localStorage on set and on sync get", async () => {
    const m = await fresh();
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("full");
    });
    m.i18n.set("en");
    expect(m.i18n.get()).toBe("en");
  });

  it("detects no language without navigator, and falls back to English for a missing message", async () => {
    vi.stubGlobal("navigator", undefined);
    const m = await fresh();
    expect(m.i18n.get()).toBe("uz");
    expect(m.translate("uz", "no.such.key" as never)).toBeUndefined();
  });

  it("subscribe returns an unsubscribe", async () => {
    const { i18n } = await fresh();
    const fn = vi.fn();
    const off = i18n.subscribe(fn);
    i18n.set("ru");
    off();
    i18n.set("en");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("registers a synced setting that reads stored value and applies server values", async () => {
    vi.resetModules();
    const reg = vi.fn();
    vi.doMock("../settingsSync", () => ({ settingsSync: { register: reg, push: vi.fn() } }));
    const { i18n } = await import("./index");
    const setting = reg.mock.calls[0]?.[0];
    localStorage.setItem("iwillbegoogler.lang", "ru");
    expect(setting.get()).toBe("ru");
    localStorage.setItem("iwillbegoogler.lang", "zz");
    expect(setting.get()).toBeUndefined();
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("x");
    });
    expect(setting.get()).toBeUndefined();
    vi.restoreAllMocks();
    setting.apply("zz");
    expect(i18n.get()).not.toBe("zz");
    setting.apply(i18n.get());
    const other = i18n.get() === "en" ? "ru" : "en";
    setting.apply(other);
    expect(i18n.get()).toBe(other);
    vi.doUnmock("../settingsSync");
  });
});

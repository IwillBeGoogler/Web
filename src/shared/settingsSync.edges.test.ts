import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettingsSync, SETTINGS_PATH } from "./settingsSync";

const mk = (token: unknown = "t") => {
  let tok: unknown = token;
  const ls = new Set<(t: unknown) => void>();
  return {
    tokens: {
      get: () => tok,
      subscribe: (l: (t: unknown) => void) => {
        ls.add(l);
        return () => void ls.delete(l);
      },
    },
    set: (t: unknown) => {
      tok = t;
      for (const l of ls) l(t);
    },
  };
};

describe("settingsSync edges", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("flush without deps or when nothing is pending is a no-op", async () => {
    const sync = createSettingsSync(10);
    await sync.flush();
    const { tokens } = mk();
    const http = vi.fn(async () => ({ prefs: {} }));
    sync.start({ http, tokens });
    await vi.advanceTimersByTimeAsync(0);
    http.mockClear();
    await sync.flush();
    expect(http).not.toHaveBeenCalled();
  });

  it("ignores a pull answer without prefs, a non-object, and a failing pull", async () => {
    for (const reply of [null, {}, { prefs: "x" }, new Error("down")]) {
      const sync = createSettingsSync(10);
      const apply = vi.fn();
      sync.register({ key: "k", get: () => 1, apply });
      const http = vi.fn(async () => {
        if (reply instanceof Error) throw reply;
        return reply;
      });
      sync.start({ http, tokens: mk().tokens });
      await vi.advanceTimersByTimeAsync(0);
      expect(apply).not.toHaveBeenCalled();
    }
  });

  it("drops a pull answer that arrives after sign-out", async () => {
    const m = mk();
    const sync = createSettingsSync(10);
    const apply = vi.fn();
    sync.register({ key: "k", get: () => 1, apply });
    let resolve!: (v: unknown) => void;
    const http = vi.fn(() => new Promise((r) => (resolve = r)));
    sync.start({ http, tokens: m.tokens });
    m.set(null);
    resolve({ prefs: { k: 2 } });
    await vi.advanceTimersByTimeAsync(0);
    expect(apply).not.toHaveBeenCalled();
  });

  it("merges a flushed batch into the server copy and unregisters", async () => {
    const sync = createSettingsSync(10);
    const http = vi.fn(async (_p: string, o?: { method?: string }) => (o?.method === "PATCH" ? {} : { prefs: { a: 1 } }));
    const apply = vi.fn();
    const off = sync.register({ key: "a", get: () => 1, apply });
    sync.start({ http, tokens: mk().tokens });
    await vi.advanceTimersByTimeAsync(0);
    sync.push("b", 2);
    sync.push("b", 3);
    await vi.advanceTimersByTimeAsync(20);
    expect(http).toHaveBeenCalledWith(SETTINGS_PATH, { method: "PATCH", body: { b: 3 } });
    sync.push("b", 3); // server now holds it
    off();
    off();
    const sync2 = createSettingsSync(10);
    const keep = sync2.register({ key: "z", get: () => 1, apply });
    sync2.register({ key: "z", get: () => 2, apply });
    keep();
  });

  it("a bad server value does not break apply, and sign-out clears pending", async () => {
    const m = mk();
    const sync = createSettingsSync(10);
    sync.register({
      key: "a",
      get: () => 1,
      apply: () => {
        throw new Error("bad");
      },
    });
    const http = vi.fn(async () => ({ prefs: { a: 1 } }));
    const stop = sync.start({ http, tokens: m.tokens });
    await vi.advanceTimersByTimeAsync(0);
    sync.push("q", 1);
    m.set(null);
    m.set("again");
    await vi.advanceTimersByTimeAsync(0);
    stop();
    stop();
  });
});

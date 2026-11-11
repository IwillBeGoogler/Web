import { describe, expect, it, vi } from "vitest";
import { createTokenStore } from "./tokenStore";

const KEY = "iwillbegoogler.session";

function fakes() {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
  };
  const target = new EventTarget();
  const events = { addEventListener: target.addEventListener.bind(target) } as Pick<Window, "addEventListener">;
  /** What the browser does in this tab when another tab writes `key`. */
  const otherTab = (key: string | null, value: string | null) => {
    if (key !== null) value === null ? data.delete(key) : data.set(key, value);
    else data.clear();
    target.dispatchEvent(Object.assign(new Event("storage"), { key }));
  };
  return { data, storage, events, otherTab };
}

const token = (t: string) => JSON.stringify({ token: t, expiresAt: "2030-01-01T00:00:00Z" });

describe("tokenStore", () => {
  it("reads the stored token, mirrors writes and notifies subscribers", () => {
    const f = fakes();
    f.data.set(KEY, token("a"));
    const store = createTokenStore(f.storage, f.events);
    expect(store.get()?.token).toBe("a");
    const seen = vi.fn();
    const off = store.subscribe(seen);
    store.set({ token: "b", expiresAt: "x" });
    expect(JSON.parse(f.data.get(KEY) ?? "{}").token).toBe("b");
    expect(seen).toHaveBeenCalledWith({ token: "b", expiresAt: "x" });
    store.set(null);
    expect(f.data.has(KEY)).toBe(false);
    off();
    store.set({ token: "c", expiresAt: "x" });
    expect(seen).toHaveBeenCalledTimes(2);
  });

  it("ignores broken stored values and works without storage", () => {
    const f = fakes();
    f.data.set(KEY, "{not json");
    expect(createTokenStore(f.storage, f.events).get()).toBeNull();
    f.data.set(KEY, JSON.stringify({ token: 1 }));
    expect(createTokenStore(f.storage, f.events).get()).toBeNull();
    const memory = createTokenStore(null, null);
    memory.set({ token: "m", expiresAt: "x" });
    expect(memory.get()?.token).toBe("m");
  });

  it("keeps the token in memory when storage refuses the write", () => {
    const store = createTokenStore(
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("quota");
        },
        removeItem: () => {},
      },
      null,
    );
    store.set({ token: "q", expiresAt: "x" });
    expect(store.get()?.token).toBe("q");
  });

  it("takes over a token another tab rotated, and its sign-out", () => {
    const f = fakes();
    f.data.set(KEY, token("old"));
    const store = createTokenStore(f.storage, f.events);
    const seen = vi.fn();
    store.subscribe(seen);

    f.otherTab(KEY, token("rotated"));
    expect(store.get()?.token).toBe("rotated");
    expect(seen).toHaveBeenLastCalledWith(expect.objectContaining({ token: "rotated" }));

    f.otherTab("some.other.key", "1"); // not ours
    f.otherTab(KEY, token("rotated")); // same token: no second notification
    expect(seen).toHaveBeenCalledTimes(1);

    f.otherTab(KEY, null);
    expect(store.get()).toBeNull();
    expect(seen).toHaveBeenLastCalledWith(null);

    f.data.set(KEY, token("again"));
    f.otherTab(KEY, token("again"));
    f.otherTab(null, null); // storage.clear() in another tab
    expect(store.get()).toBeNull();
  });
});

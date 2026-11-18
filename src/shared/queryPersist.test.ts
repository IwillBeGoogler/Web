import { QueryClient } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistQueries } from "./queryPersist";

const KEY = "iwbg:queries:v1";

class MemStorage {
  m = new Map<string, string>();
  getItem = (k: string) => this.m.get(k) ?? null;
  setItem = (k: string, v: string) => void this.m.set(k, v);
  removeItem = (k: string) => void this.m.delete(k);
}
const mem = () => new MemStorage() as unknown as Storage & MemStorage;
const saved = (s: Storage) => JSON.parse(s.getItem(KEY) ?? "null") as { state: { queries: { queryKey: unknown[]; state: { data: unknown } }[] } } | null;

describe("persistQueries", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("is a no-op without storage", () => {
    const off = persistQueries(new QueryClient(), undefined);
    expect(off).toBeTypeOf("function");
    off();
  });

  it("saves public successful queries after a second, first page only", () => {
    const s = mem();
    const qc = new QueryClient();
    const off = persistQueries(qc, s);
    qc.setQueryData(["trending"], [1]);
    qc.setQueryData(["tags"], ["go"]);
    qc.setQueryData(["landing", "x"], 1);
    qc.setQueryData(["site-stats"], { n: 1 });
    qc.setQueryData(["feed", { kind: "latest" }], { pages: [1, 2], pageParams: [0, 1] });
    qc.setQueryData(["feed", { kind: "latest", tag: "go" }], { pages: [1], pageParams: [0] });
    qc.setQueryData(["feed", { kind: "for-you" }], 1);
    qc.setQueryData(["me"], { id: 1 });
    expect(s.getItem(KEY)).toBeNull();
    vi.advanceTimersByTime(1000);
    const out = saved(s);
    const keys = out?.state.queries.map((q) => q.queryKey[0]);
    expect(keys).toEqual(expect.arrayContaining(["trending", "tags", "landing", "site-stats", "feed"]));
    expect(keys).not.toContain("me");
    const feed = out?.state.queries.find((q) => q.queryKey[0] === "feed");
    expect(feed?.state.data).toEqual({ pages: [1], pageParams: [0] });
    off();
  });

  it("restores a fresh copy and drops a stale one", () => {
    const s = mem();
    const a = new QueryClient();
    persistQueries(a, s);
    a.setQueryData(["trending"], [7]);
    vi.advanceTimersByTime(1000);

    const b = new QueryClient();
    persistQueries(b, s);
    expect(b.getQueryData(["trending"])).toEqual([7]);

    vi.setSystemTime(Date.now() + 25 * 60 * 60_000);
    const c = new QueryClient();
    persistQueries(c, s);
    expect(c.getQueryData(["trending"])).toBeUndefined();
    expect(s.getItem(KEY)).toBeNull();
  });

  it("ignores unreadable storage and removes the copy when nothing is public", () => {
    const s = mem();
    s.setItem(KEY, "{not json");
    const qc = new QueryClient();
    persistQueries(qc, s);
    qc.setQueryData(["trending"], [1]);
    vi.advanceTimersByTime(1000);
    expect(saved(s)).not.toBeNull();
    qc.removeQueries({ queryKey: ["trending"] });
    vi.advanceTimersByTime(1000);
    expect(s.getItem(KEY)).toBeNull();
  });

  it("skips private updates, oversize copies and storage errors", () => {
    const s = mem();
    const qc = new QueryClient();
    persistQueries(qc, s);
    qc.setQueryData(["me"], 1);
    vi.advanceTimersByTime(1000);
    expect(s.getItem(KEY)).toBeNull();

    qc.setQueryData(["trending"], "x".repeat(1_600_000));
    vi.advanceTimersByTime(1000);
    expect(s.getItem(KEY)).toBeNull();

    s.setItem = () => {
      throw new Error("full");
    };
    qc.setQueryData(["trending"], [1]);
    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
  });
});

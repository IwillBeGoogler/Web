import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createHttpClient } from "./client";
import { dataEnvelope, nextPageRequest, pageEnvelope } from "./envelope";
import { NetworkError } from "./problem";
import { createTokenStore } from "./tokenStore";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const make = (fetchImpl: (url: string, init: RequestInit) => Promise<Response>, token: string | null = "t1") => {
  const tokens = createTokenStore(null);
  if (token) tokens.set({ token, expiresAt: "2030-01-01T00:00:00Z" });
  const onSessionExpired = vi.fn();
  const client = createHttpClient({ tokens, locale: () => "en", onSessionExpired, fetch: fetchImpl as typeof fetch });
  return { client, tokens, onSessionExpired };
};

describe("http client refresh edges", () => {
  it("retries after another tab rotated the token (refresh 401 but newer token present)", async () => {
    let calls = 0;
    const m = make(async (url) => {
      if (url.endsWith("/auth/refresh")) {
        m.tokens.set({ token: "t2", expiresAt: "2031-01-01T00:00:00Z" });
        return json(401, {});
      }
      return calls++ === 0 ? json(401, {}) : json(200, { ok: 1 });
    });
    expect(await m.client("/x")).toEqual({ ok: 1 });
    expect(m.onSessionExpired).not.toHaveBeenCalled();
  });

  it("keeps the session on a failing refresh (5xx, missing token in body, network error)", async () => {
    for (const refresh of [
      async () => json(500, {}),
      async () => json(200, { data: {} }),
      async () => json(200, null),
      async () => {
        throw new TypeError("offline");
      },
    ]) {
      const m = make(async (url) => (url.endsWith("/auth/refresh") ? refresh() : json(401, {})));
      await expect(m.client("/x")).rejects.toMatchObject({ status: 401 });
      expect(m.tokens.get()).not.toBeNull();
      expect(m.onSessionExpired).not.toHaveBeenCalled();
    }
  });

  it("expires the session when refresh is refused", async () => {
    const m = make(async (url) => (url.endsWith("/auth/refresh") ? json(403, {}) : json(401, {})));
    await expect(m.client("/x")).rejects.toMatchObject({ status: 401 });
    expect(m.tokens.get()).toBeNull();
    expect(m.onSessionExpired).toHaveBeenCalled();
  });

  it("expires when the token vanished before refresh and does not refresh with noRefresh", async () => {
    const f = vi.fn(async () => json(401, {}));
    const m = make(f);
    await expect(m.client("/x", { noRefresh: true })).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1);
    const m2 = make(async (url) => {
      if (!url.endsWith("/auth/refresh")) m2.tokens.set(null);
      return json(401, {});
    });
    await expect(m2.client("/x")).rejects.toMatchObject({ status: 401 });
    expect(m2.onSessionExpired).toHaveBeenCalled();
  });
});

describe("http client send edges", () => {
  it("combines a caller signal with a timeout, sends FormData and blobs", async () => {
    let init: RequestInit | undefined;
    const m = make(async (_u, i) => {
      init = i;
      return new Response("bytes", { status: 200 });
    }, null);
    const ctl = new AbortController();
    const blob = await m.client("/f", { method: "POST", body: new FormData(), signal: ctl.signal, timeoutMs: 1000, blob: true, query: { a: 1 } });
    expect(blob).toBeInstanceOf(Blob);
    expect(init?.signal).toBeTruthy();
    expect(((init?.headers ?? {}) as Record<string, string>)["Content-Type"]).toBeUndefined();
    await m.client("/g", { timeoutMs: 1000 }).catch(() => undefined);
    await m.client("/h", { signal: ctl.signal }).catch(() => undefined);
  });

  it("wraps network failures and passes aborts through", async () => {
    const m = make(async () => {
      throw new TypeError("down");
    });
    await expect(m.client("/x?secret=1")).rejects.toBeInstanceOf(NetworkError);
    const a = make(async () => {
      throw new DOMException("aborted", "AbortError");
    });
    await expect(a.client("/x")).rejects.toBeInstanceOf(DOMException);
    const o = make(async () => {
      throw new Error("other");
    });
    await expect(o.client("/x")).rejects.toThrow("other");
  });

  it("reports contract violations and error bodies that are not problems", async () => {
    const m = make(async (u) => (u.includes("bad") ? json(500, "text") : json(200, { data: "nope" })), null);
    await expect(m.client("/ok", { schema: dataEnvelope(z.number()) })).rejects.toThrow();
    await expect(m.client("/bad")).rejects.toMatchObject({ status: 500 });
  });
});

describe("envelope edges", () => {
  it("fills page defaults from a bare envelope and null data", () => {
    const s = pageEnvelope(z.number());
    expect(s.parse({ data: [1, 2] }).meta).toMatchObject({ page: 0, limit: 0, total: 2, hasMore: false, nextCursor: undefined });
    expect(s.parse({ data: null }).items).toEqual([]);
    expect(s.parse({ data: [1], meta: { page: 2, limit: 5, total: 9, has_more: true, next_cursor: "c" } }).meta.nextCursor).toBe("c");
  });
  it("next page request", () => {
    expect(nextPageRequest({ page: 0, limit: 1, total: 1, hasMore: true, nextCursor: undefined }, 5)).toEqual({ page: 2, limit: 5 });
    expect(nextPageRequest({ page: 3, limit: 1, total: 1, hasMore: true, nextCursor: undefined })).toEqual({ page: 4, limit: undefined });
    expect(nextPageRequest({ page: 1, limit: 1, total: 1, hasMore: false, nextCursor: "c" }, 5)).toEqual({ cursor: "c", limit: 5 });
    expect(nextPageRequest({ page: 1, limit: 1, total: 1, hasMore: false, nextCursor: undefined })).toBeUndefined();
  });
});

describe("token store storage failures", () => {
  it("survives throwing storage", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("x");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("x");
    });
    const s = createTokenStore();
    expect(s.get()).toBeNull();
    const fn = vi.fn();
    const off = s.subscribe(fn);
    s.set({ token: "a", expiresAt: "b" });
    off();
    expect(fn).toHaveBeenCalled();
    get.mockRestore();
    set.mockRestore();
  });
  it("ignores malformed stored tokens", () => {
    localStorage.setItem("iwillbegoogler.session", JSON.stringify({ token: 1 }));
    expect(createTokenStore().get()).toBeNull();
    localStorage.clear();
  });
});

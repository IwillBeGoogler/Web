import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { api, server } from "@/test/server";
import { buildQuery, createHttpClient } from "./client";
import { dataEnvelope, nextPageRequest, pageEnvelope } from "./envelope";
import { ApiError, ContractError, errorMessage } from "./problem";
import { createTokenStore } from "./tokenStore";

const setup = (token: string | null = "t1") => {
  const tokens = createTokenStore(null);
  if (token) tokens.set({ token, expiresAt: "2030-01-01T00:00:00Z" });
  const onSessionExpired = vi.fn();
  const client = createHttpClient({ tokens, locale: () => "uz", onSessionExpired });
  return { tokens, client, onSessionExpired };
};

describe("buildQuery", () => {
  it("drops empty values", () => {
    expect(buildQuery({ a: 1, b: "", c: undefined, d: null, q: "x y" })).toBe("?a=1&q=x+y");
    expect(buildQuery({})).toBe("");
  });
});

describe("http client", () => {
  it("sends bearer + Accept-Language and parses the envelope", async () => {
    server.use(
      http.get(api("/thing"), ({ request }) => {
        expect(request.headers.get("authorization")).toBe("Bearer t1");
        expect(request.headers.get("accept-language")).toBe("uz");
        return HttpResponse.json({ data: { id: 1 } });
      }),
    );
    const { client } = setup();
    const r = await client("/thing", { schema: dataEnvelope(z.object({ id: z.number() })) });
    expect(r.data.id).toBe(1);
  });

  it("throws ApiError with problem details", async () => {
    server.use(
      http.put(api("/x"), () =>
        HttpResponse.json({ title: "Conflict", status: 409, detail: "already decided", code: "CONFLICT", request_id: "r1" }, { status: 409 }),
      ),
    );
    const { client } = setup();
    const err = (await client("/x", { method: "PUT", body: {} }).catch((e: unknown) => e)) as ApiError;
    expect(err).toBeInstanceOf(ApiError);
    expect(err.isConflict).toBe(true);
    expect(err.message).toBe("already decided");
    expect(err.code).toBe("CONFLICT");
    expect(errorMessage(err)).toContain("r1");
  });

  it("falls back to HTTP status for non-JSON errors", async () => {
    server.use(http.get(api("/x"), () => new HttpResponse(null, { status: 502 })));
    const err = (await setup()
      .client("/x")
      .catch((e: unknown) => e)) as Error;
    expect(err.message).toBe("HTTP 502");
  });

  it("raises ContractError when the body does not match", async () => {
    server.use(http.get(api("/x"), () => HttpResponse.json({ data: { id: "nope" } })));
    const err = await setup()
      .client("/x", { schema: dataEnvelope(z.object({ id: z.number() })) })
      .catch((e) => e);
    expect(err).toBeInstanceOf(ContractError);
  });

  it("returns null for 204", async () => {
    server.use(http.delete(api("/x"), () => new HttpResponse(null, { status: 204 })));
    expect(await setup().client("/x", { method: "DELETE" })).toBeNull();
  });

  it("refreshes once on 401 and retries with the rotated token", async () => {
    let refreshes = 0;
    server.use(
      http.post(api("/auth/refresh"), ({ request }) => {
        refreshes++;
        expect(request.headers.get("authorization")).toBe("Bearer t1");
        return HttpResponse.json({ data: { token: "t2", expires_at: "2030-01-01T00:00:00Z" } });
      }),
      http.get(api("/a"), ({ request }) =>
        request.headers.get("authorization") === "Bearer t2" ? HttpResponse.json({ ok: 1 }) : HttpResponse.json({ status: 401 }, { status: 401 }),
      ),
    );
    const { client, tokens } = setup();
    const [a, b] = await Promise.all([client("/a"), client("/a")]);
    expect(a).toEqual({ ok: 1 });
    expect(b).toEqual({ ok: 1 });
    expect(refreshes).toBe(1);
    expect(tokens.get()?.token).toBe("t2");
  });

  it("clears the session when refresh fails", async () => {
    server.use(
      http.post(api("/auth/refresh"), () => HttpResponse.json({}, { status: 401 })),
      http.get(api("/a"), () => HttpResponse.json({ detail: "unauthorized" }, { status: 401 })),
    );
    const { client, tokens, onSessionExpired } = setup();
    await expect(client("/a")).rejects.toBeInstanceOf(ApiError);
    expect(tokens.get()).toBeNull();
    expect(onSessionExpired).toHaveBeenCalledOnce();
  });

  it("does not refresh anonymous calls", async () => {
    const refresh = vi.fn();
    server.use(
      http.post(api("/auth/refresh"), refresh),
      http.post(api("/auth/login"), () => HttpResponse.json({ detail: "bad" }, { status: 401 })),
    );
    await expect(setup(null).client("/auth/login", { method: "POST", body: {} })).rejects.toThrow("bad");
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("pageEnvelope", () => {
  const schema = pageEnvelope(z.object({ id: z.number() }));
  it("maps meta", () => {
    const p = schema.parse({ data: [{ id: 1 }], meta: { page: 1, limit: 1, total: 3, has_more: true, next_cursor: "c" } });
    expect(p).toEqual({ items: [{ id: 1 }], meta: { page: 1, limit: 1, total: 3, hasMore: true, nextCursor: "c" } });
  });
  it("tolerates null data and missing meta", () => {
    expect(schema.parse({ data: null }).items).toEqual([]);
    expect(schema.parse({ data: [{ id: 2 }] }).meta.total).toBe(1);
  });
  it("computes the next request", () => {
    const meta = { page: 2, limit: 10, total: 30, hasMore: true, nextCursor: undefined };
    expect(nextPageRequest(meta, 10)).toEqual({ page: 3, limit: 10 });
    expect(nextPageRequest({ ...meta, nextCursor: "abc" })).toEqual({ cursor: "abc", limit: undefined });
    expect(nextPageRequest({ ...meta, hasMore: false })).toBeUndefined();
  });
});

describe("token store", () => {
  it("persists to storage and notifies", () => {
    const mem = new Map<string, string>();
    const storage = {
      getItem: (k: string) => mem.get(k) ?? null,
      setItem: (k: string, v: string) => void mem.set(k, v),
      removeItem: (k: string) => void mem.delete(k),
    };
    const s = createTokenStore(storage);
    const l = vi.fn();
    s.subscribe(l);
    s.set({ token: "a", expiresAt: "x" });
    expect(createTokenStore(storage).get()?.token).toBe("a");
    s.set(null);
    expect(createTokenStore(storage).get()).toBeNull();
    expect(l).toHaveBeenCalledTimes(2);
  });
  it("ignores corrupt storage", () => {
    expect(createTokenStore({ getItem: () => "{bad", setItem() {}, removeItem() {} }).get()).toBeNull();
  });
});

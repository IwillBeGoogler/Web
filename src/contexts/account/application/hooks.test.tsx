import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { page } from "@/test/fixtures";
import { testQueryClient } from "@/test/render";
import { api, server } from "@/test/server";
import {
  accountKeys,
  blocksQuery,
  devicesQuery,
  followedTagsQuery,
  followersQuery,
  hiddenQuery,
  mfaQuery,
  mutesQuery,
  useChangePassword,
  useDeleteAccount,
  useHide,
  useInvalidate,
  useRelation,
  useSignOutEverywhere,
  useToggleTag,
} from "./hooks";

const setup = () => {
  const qc = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
};
const ok = () => new HttpResponse(null, { status: 204 });
const user = { id: 1, username: "bob" };

afterEach(() => tokens.set(null));

describe("account queries", () => {
  it("fetch single resources", async () => {
    server.use(
      http.get(api("/me/2fa"), () => HttpResponse.json({ data: { enabled: false } })),
      http.get(api("/me/sessions"), () => HttpResponse.json({ data: [] })),
      http.get(api("/me/tags"), () => HttpResponse.json({ data: ["go"] })),
    );
    const { qc } = setup();
    expect((await qc.fetchQuery(mfaQuery())).enabled).toBe(false);
    expect(await qc.fetchQuery(devicesQuery())).toEqual([]);
    expect(await qc.fetchQuery(followedTagsQuery())).toEqual(["go"]);
  });

  it("paged queries fetch and ask for the next page", async () => {
    server.use(
      http.get(api("/me/blocks"), () => page([user], { has_more: true })),
      http.get(api("/me/mutes"), () => page([user])),
      http.get(api("/me/hidden"), () => page([{ kind: "tag", target: "x", created_at: "x" }])),
      http.get(api("/users/bob/followers"), () => page([user], { has_more: true })),
      http.get(api("/users/bob/following"), () => page([user])),
    );
    const { qc } = setup();
    const blocks = blocksQuery();
    const d = await qc.fetchInfiniteQuery(blocks);
    expect(blocks.getNextPageParam(d.pages[0] as never, d.pages, d.pageParams[0] as never, d.pageParams)).toEqual({ page: 2, limit: 20 });
    expect((await qc.fetchInfiniteQuery(mutesQuery())).pages[0]?.items).toHaveLength(1);
    expect((await qc.fetchInfiniteQuery(hiddenQuery())).pages[0]?.items).toHaveLength(1);
    expect((await qc.fetchInfiniteQuery(followersQuery("bob", "followers"))).pages[0]?.items).toHaveLength(1);
    expect((await qc.fetchInfiniteQuery(followersQuery("bob", "following"))).pages[0]?.items).toHaveLength(1);
  });
});

describe("account mutations", () => {
  it("useChangePassword stores the new token and refreshes devices", async () => {
    server.use(http.put(api("/me/password"), () => HttpResponse.json({ data: { token: "new", expires_at: "2031-01-01T00:00:00Z", user: { ...user, created_at: "x" } } })));
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useChangePassword(), { wrapper });
    await act(() => result.current.mutateAsync({ old_password: "a", new_password: "b" }));
    expect(tokens.get()).toEqual({ token: "new", expiresAt: "2031-01-01T00:00:00Z" });
    expect(spy).toHaveBeenCalledWith({ queryKey: accountKeys.devices });
  });

  it("useInvalidate invalidates every key", async () => {
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useInvalidate(["a"], ["b"]), { wrapper });
    await result.current();
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("sign out everywhere and delete account clear token and cache", async () => {
    server.use(http.post(api("/auth/logout-all"), ok), http.delete(api("/me"), ok));
    const { qc, wrapper } = setup();
    const clear = vi.spyOn(qc, "clear");
    tokens.set({ token: "t", expiresAt: "x" });
    const out = renderHook(() => useSignOutEverywhere(), { wrapper });
    await act(() => out.result.current.mutateAsync());
    expect(tokens.get()).toBeNull();
    expect(clear).toHaveBeenCalledTimes(1);
    tokens.set({ token: "t", expiresAt: "x" });
    const del = renderHook(() => useDeleteAccount(), { wrapper });
    await act(() => del.result.current.mutateAsync("pw"));
    expect(tokens.get()).toBeNull();
    expect(clear).toHaveBeenCalledTimes(2);
  });

  it("useToggleTag updates the cached tags optimistically and invalidates", async () => {
    server.use(http.all(api("/tags/go/follow"), ok), http.all(api("/tags/rust/follow"), ok));
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useToggleTag(), { wrapper });
    await act(() => result.current.mutateAsync({ tag: "go", on: true }));
    expect(qc.getQueryData(accountKeys.tags)).toEqual(["go"]);
    await act(() => result.current.mutateAsync({ tag: "go", on: true }));
    expect(qc.getQueryData(accountKeys.tags)).toEqual(["go"]);
    await act(() => result.current.mutateAsync({ tag: "go", on: false }));
    expect(qc.getQueryData(accountKeys.tags)).toEqual([]);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["feed", { kind: "for-you" }] });
  });

  it("useHide hides and unhides then refreshes feeds", async () => {
    const methods: string[] = [];
    server.use(
      http.all(api("/me/hidden"), ({ request }) => {
        methods.push(request.method);
        return ok();
      }),
      http.delete(api("/me/hidden/tag/x"), () => {
        methods.push("DELETE tag");
        return ok();
      }),
    );
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useHide(), { wrapper });
    await act(() => result.current.mutateAsync({ kind: "tag", target: "x", on: true }));
    await act(() => result.current.mutateAsync({ kind: "tag", target: "x", on: false }));
    expect(methods).toEqual(["POST", "DELETE tag"]);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["feed-preview"] });
  });

  it.each([
    ["block", true],
    ["mute", false],
    ["subscribe", false],
  ] as const)("useRelation(%s)", async (kind, feeds) => {
    server.use(http.all(api(`/users/bob/${kind}`), ok));
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useRelation(kind), { wrapper });
    await act(() => result.current.mutateAsync({ username: "bob", on: true }));
    await waitFor(() => expect(spy).toHaveBeenCalledWith({ queryKey: ["profile", "bob"] }));
    expect(spy).toHaveBeenCalledWith({ queryKey: kind === "block" ? accountKeys.blocks : accountKeys.mutes });
    expect(spy.mock.calls.some((c) => (c[0]?.queryKey as unknown[])[0] === "feed")).toBe(feeds);
  });
});

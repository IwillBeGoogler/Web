import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { page } from "@/test/fixtures";
import { testQueryClient } from "@/test/render";
import { api, server } from "@/test/server";
import {
  highlightsQuery,
  listPostsQuery,
  listQuery,
  membersQuery,
  myListsQuery,
  myPublicationsQuery,
  postSeriesQuery,
  publicationPostsQuery,
  publicationQuery,
  seriesQuery,
  useHighlightMutations,
  useListMutations,
  usePublicationMutations,
  userListsQuery,
  userSeriesQuery,
  useSeriesMutations,
} from "./hooks";

const setup = () => {
  const qc = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
};
const ok = () => new HttpResponse(null, { status: 204 });
const list = { id: 1, slug: "l", name: "L" };
const series = { id: 2, slug: "s", title: "S" };
const pub = { id: 3, slug: "p", name: "P", my_role: "owner" };
const post = { id: 1, title: "T", slug: "t", status: "published", author: "a", created_at: "x", updated_at: "x" };

describe("collections queries", () => {
  it("lists", async () => {
    server.use(
      http.get(api("/me/lists"), () => page([list], { has_more: true })),
      http.get(api("/users/u/lists"), () => page([list])),
      http.get(api("/lists/l"), () => HttpResponse.json({ data: list })),
      http.get(api("/lists/l/posts"), () => page([post])),
    );
    const { qc } = setup();
    const mine = myListsQuery(4);
    const d = await qc.fetchInfiniteQuery(mine);
    expect(mine.getNextPageParam(d.pages[0] as never, d.pages, d.pageParams[0] as never, d.pageParams)).toEqual({ page: 2, limit: 20 });
    expect((await qc.fetchInfiniteQuery(myListsQuery())).pages[0]?.items).toHaveLength(1);
    expect((await qc.fetchInfiniteQuery(userListsQuery("u"))).pages[0]?.items).toHaveLength(1);
    expect((await qc.fetchQuery(listQuery("l"))).slug).toBe("l");
    expect((await qc.fetchInfiniteQuery(listPostsQuery("l"))).pages[0]?.items).toHaveLength(1);
  });

  it("series, highlights and publications", async () => {
    server.use(
      http.get(api("/users/u/series"), () => HttpResponse.json({ data: [series] })),
      http.get(api("/series/s"), () => HttpResponse.json({ data: series })),
      http.get(api("/posts/1/series"), () => HttpResponse.json({ data: { series } })),
      http.get(api("/posts/1/highlights"), () => HttpResponse.json({ data: { top: [], mine: [] } })),
      http.get(api("/me/publications"), () => HttpResponse.json({ data: [pub] })),
      http.get(api("/publications/p"), () => HttpResponse.json({ data: pub })),
      http.get(api("/publications/p/members"), () => HttpResponse.json({ data: [] })),
      http.get(api("/publications/p/posts"), () => page([post])),
    );
    const { qc } = setup();
    expect(await qc.fetchQuery(userSeriesQuery("u"))).toHaveLength(1);
    expect((await qc.fetchQuery(seriesQuery("s"))).slug).toBe("s");
    expect((await qc.fetchQuery(postSeriesQuery(1))) as unknown).toBeTruthy();
    expect((await qc.fetchQuery(highlightsQuery(1))).top).toEqual([]);
    expect(await qc.fetchQuery(myPublicationsQuery())).toHaveLength(1);
    expect((await qc.fetchQuery(publicationQuery("p"))).slug).toBe("p");
    expect(await qc.fetchQuery(membersQuery("p"))).toEqual([]);
    expect((await qc.fetchInfiniteQuery(publicationPostsQuery("p"))).pages[0]?.items).toHaveLength(1);
  });
});

describe("collections mutations", () => {
  it("list mutations refresh lists", async () => {
    server.use(
      http.post(api("/lists"), () => HttpResponse.json({ data: list })),
      http.patch(api("/lists/l"), () => HttpResponse.json({ data: list })),
      http.delete(api("/lists/l"), ok),
      http.put(api("/lists/l/posts/4"), ok),
    );
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useListMutations(), { wrapper });
    const body = { name: "L", description: "", private: false };
    await act(async () => {
      await result.current.create.mutateAsync(body);
      await result.current.update.mutateAsync({ slug: "l", body });
      await result.current.remove.mutateAsync("l");
      await result.current.setPost.mutateAsync({ slug: "l", postId: 4, on: true });
    });
    expect(spy).toHaveBeenCalledTimes(4);
    expect(spy).toHaveBeenCalledWith({ queryKey: ["lists"] });
  });

  it("series mutations refresh series", async () => {
    server.use(
      http.post(api("/series"), () => HttpResponse.json({ data: series })),
      http.patch(api("/series/s"), () => HttpResponse.json({ data: series })),
      http.delete(api("/series/s"), ok),
      http.put(api("/series/s/posts"), ok),
    );
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSeriesMutations(), { wrapper });
    await act(async () => {
      await result.current.create.mutateAsync({ title: "S", description: "" });
      await result.current.update.mutateAsync({ slug: "s", body: { title: "S", description: "" } });
      await result.current.remove.mutateAsync("s");
      await result.current.setPosts.mutateAsync({ slug: "s", ids: [1] });
    });
    expect(spy).toHaveBeenCalledTimes(4);
  });

  it("highlight mutations refresh the post's highlights", async () => {
    server.use(http.post(api("/posts/1/highlights"), ok), http.delete(api("/highlights/9"), ok));
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useHighlightMutations(1), { wrapper });
    await act(async () => {
      await result.current.add.mutateAsync({ start: 0, end: 2 });
      await result.current.remove.mutateAsync(9);
    });
    expect(spy).toHaveBeenCalledWith({ queryKey: ["highlights", 1] });
    expect(spy).toHaveBeenCalledTimes(2);
  });

  it("publication mutations refresh publications", async () => {
    server.use(
      http.post(api("/publications"), () => HttpResponse.json({ data: pub })),
      http.patch(api("/publications/p"), () => HttpResponse.json({ data: pub })),
      http.delete(api("/publications/p"), ok),
      http.put(api("/publications/p/members/u"), ok),
      http.delete(api("/publications/p/members/u"), ok),
    );
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => usePublicationMutations(), { wrapper });
    await act(async () => {
      await result.current.create.mutateAsync({ slug: "p", name: "P", description: "" });
      await result.current.update.mutateAsync({ slug: "p", body: { name: "P", description: "", avatar_url: "" } });
      await result.current.remove.mutateAsync("p");
      await result.current.setMember.mutateAsync({ slug: "p", u: "u", role: "editor" });
      await result.current.removeMember.mutateAsync({ slug: "p", u: "u" });
    });
    expect(spy).toHaveBeenCalledTimes(5);
  });
});

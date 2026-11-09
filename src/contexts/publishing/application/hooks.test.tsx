import { QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { testQueryClient } from "@/test/render";
import { api, server } from "@/test/server";
import { emptyStory } from "../domain/story";
import { useDeleteStory, useSaveStory } from "./hooks";

const post = { id: 5, title: "T", slug: "t-slug", status: "draft", author: "ali", created_at: "x", updated_at: "x" };
const form = { ...emptyStory(), title: "T", body: "b" };

const setup = () => {
  const qc = testQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
};

describe("useSaveStory", () => {
  it("creates when there is no id, then invalidates the story caches", async () => {
    const hits: string[] = [];
    server.use(
      http.post(api("/posts"), () => {
        hits.push("create");
        return HttpResponse.json({ data: post });
      }),
    );
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useSaveStory(undefined), { wrapper });
    await act(() => result.current.mutateAsync(form));
    expect(hits).toEqual(["create"]);
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([["post", "t-slug"], ["feed"], ["feed-preview"], ["post-id", 5]]);
  });

  it("updates with a numeric id", async () => {
    const hits: string[] = [];
    server.use(
      http.put(api("/posts/5"), () => {
        hits.push("update");
        return HttpResponse.json({ data: post });
      }),
    );
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveStory(5), { wrapper });
    await act(() => result.current.mutateAsync(form));
    expect(hits).toEqual(["update"]);
  });

  it("reads the id lazily from a getter", async () => {
    const hits: string[] = [];
    server.use(
      http.post(api("/posts"), () => {
        hits.push("create");
        return HttpResponse.json({ data: post });
      }),
      http.put(api("/posts/9"), () => {
        hits.push("update");
        return HttpResponse.json({ data: post });
      }),
    );
    let id: number | undefined;
    const { wrapper } = setup();
    const { result } = renderHook(() => useSaveStory(() => id), { wrapper });
    await act(() => result.current.mutateAsync(form));
    id = 9;
    await act(() => result.current.mutateAsync(form));
    expect(hits).toEqual(["create", "update"]);
  });
});

describe("useDeleteStory", () => {
  it("deletes and refreshes feeds", async () => {
    server.use(http.delete(api("/posts/5"), () => new HttpResponse(null, { status: 204 })));
    const { qc, wrapper } = setup();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderHook(() => useDeleteStory(), { wrapper });
    await act(() => result.current.mutateAsync(5));
    expect(spy.mock.calls.map((c) => c[0]?.queryKey)).toEqual([["feed"], ["feed-preview"]]);
  });
});

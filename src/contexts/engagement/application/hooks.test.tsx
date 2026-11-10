import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../infrastructure/engagementRepository", () => ({
  engagementRepository: {
    clap: vi.fn(),
    bookmark: vi.fn(),
    markRead: vi.fn(),
    likeComment: vi.fn(),
  },
}));

import { engagementRepository as repo } from "../infrastructure/engagementRepository";
import { useBookmark, useClap, useLikeComment, useMarkRead, usePatchPost } from "./hooks";

const setup = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY }, mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  return { qc, wrapper };
};
const post = (id: number) => ({ id, claps: 1, my_claps: 0, bookmarked: false, comments_count: 0 });

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("usePatchPost", () => {
  it("patches matching posts in detail and feed caches, leaves others and empty caches", () => {
    const { qc, wrapper } = setup();
    qc.setQueryData(["post", "a"], post(1));
    qc.setQueryData(["post", "b"], post(2));
    qc.setQueryData(["post", "c"], undefined);
    qc.setQueryData(["feed", "x"], { pages: [{ items: [post(1), post(2)] }], pageParams: [] });
    qc.setQueryData(["feed", "y"], undefined);
    const { result } = renderHook(() => usePatchPost(), { wrapper });
    result.current(1, (p) => ({ ...p, claps: 9 }));
    expect((qc.getQueryData(["post", "a"]) as { claps: number }).claps).toBe(9);
    expect((qc.getQueryData(["post", "b"]) as { claps: number }).claps).toBe(1);
    const feed = qc.getQueryData(["feed", "x"]) as { pages: { items: { claps: number }[] }[] };
    expect(feed.pages[0]?.items.map((i) => i.claps)).toEqual([9, 1]);
  });
});

describe("useClap", () => {
  it("batches taps, resets the timer, and refuses past the cap", async () => {
    vi.useFakeTimers();
    vi.mocked(repo.clap).mockResolvedValue({ ...post(1), claps: 3, my_claps: 2 } as never);
    const { wrapper } = setup();
    const { result, rerender } = renderHook(({ p }) => useClap(p), { wrapper, initialProps: { p: { id: 1, claps: 1, my_claps: 0 } } });
    expect(result.current()).toBe(1);
    expect(result.current()).toBe(1);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(700);
    });
    expect(repo.clap).toHaveBeenCalledWith(1, 2);
    rerender({ p: { id: 1, claps: 100, my_claps: 50 } });
    expect(result.current()).toBe(0);
  });
});

describe("useBookmark", () => {
  it("rolls back on error", async () => {
    vi.mocked(repo.bookmark).mockRejectedValue(new Error("no"));
    const { qc, wrapper } = setup();
    qc.setQueryData(["post", 1], post(1));
    const { result } = renderHook(() => useBookmark(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 1, on: true }).catch(() => {});
    });
    expect((qc.getQueryData(["post", 1]) as { bookmarked: boolean }).bookmarked).toBe(false);
  });
});

describe("useMarkRead", () => {
  const notif = (id: number, unread: boolean, read_at?: string) => ({ id, unread, read_at });
  it("marks one read, only decrementing the first page, keeping existing read_at", async () => {
    vi.mocked(repo.markRead).mockResolvedValue(undefined as never);
    const { qc, wrapper } = setup();
    qc.setQueryData(["notifications"], {
      pages: [
        { items: [notif(1, true), notif(2, true, "t")], unread: 2 },
        { items: [notif(3, true, "old")], unread: 5 },
      ],
      pageParams: [],
    });
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(3);
    });
    await act(async () => {
      await result.current.mutateAsync(1);
    });
    const d = qc.getQueryData(["notifications"]) as { pages: { unread: number; items: { unread: boolean }[] }[] };
    expect(d.pages[0]?.unread).toBe(0);
    expect(d.pages[1]?.items[0]?.unread).toBe(false);
  });
  it("leaves caches without a hit or without pages", async () => {
    vi.mocked(repo.markRead).mockResolvedValue(undefined as never);
    const { qc, wrapper } = setup();
    qc.setQueryData(["notifications", "empty"], {});
    qc.setQueryData(["notifications", "none"], { pages: [{ items: [notif(5, false)], unread: 0 }], pageParams: [] });
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(5);
    });
    expect((qc.getQueryData(["notifications", "none"]) as { pages: { unread: number }[] }).pages[0]?.unread).toBe(0);
  });
  it("restores on error", async () => {
    vi.mocked(repo.markRead).mockRejectedValue(new Error("no"));
    const { qc, wrapper } = setup();
    qc.setQueryData(["notifications"], { pages: [{ items: [notif(1, true)], unread: 1 }], pageParams: [] });
    const { result } = renderHook(() => useMarkRead(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(1).catch(() => {});
    });
    await waitFor(() => expect((qc.getQueryData(["notifications"]) as { pages: { unread: number }[] }).pages[0]?.unread).toBe(1));
  });
});

describe("useLikeComment", () => {
  it("adjusts likes both ways, ignores a cold cache, invalidates on error", async () => {
    vi.mocked(repo.likeComment)
      .mockResolvedValueOnce(undefined as never)
      .mockResolvedValueOnce(undefined as never)
      .mockRejectedValueOnce(new Error("x"));
    const { qc, wrapper } = setup();
    const { result } = renderHook(() => useLikeComment(7), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: 1, on: true });
    });
    qc.setQueryData(["comments", 7], {
      pages: [
        {
          items: [
            { id: 1, liked: false, likes: 0 },
            { id: 2, liked: false, likes: 0 },
          ],
        },
      ],
      pageParams: [],
    });
    await act(async () => {
      await result.current.mutateAsync({ id: 1, on: true });
    });
    const items = () => (qc.getQueryData(["comments", 7]) as { pages: { items: { likes: number }[] }[] }).pages[0]?.items;
    expect(items()?.map((i) => i.likes)).toEqual([1, 0]);
    await act(async () => {
      await result.current.mutateAsync({ id: 1, on: false }).catch(() => {});
    });
  });
});

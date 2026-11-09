import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { testQueryClient } from "@/test/render";
import { api, server } from "@/test/server";
import { useLiveComments, useLiveNotifications } from "./realtime";

class FakeES {
  static all: FakeES[] = [];
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeES.all.push(this);
  }
  close() {
    this.closed = true;
  }
}

const wrap = () => {
  const qc = testQueryClient();
  return { qc, wrapper: ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider> };
};

beforeEach(() => {
  FakeES.all = [];
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  tokens.set(null);
});

describe("event stream reconnect", () => {
  it("reconnects with a growing delay after an error and resets on open", async () => {
    vi.stubGlobal("EventSource", FakeES);
    const { wrapper, qc } = wrap();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const { unmount } = renderHook(() => useLiveComments(7, true), { wrapper });
    await vi.waitFor(() => expect(FakeES.all).toHaveLength(1));
    expect(FakeES.all[0]?.url).toBe("/api/posts/7/comments/stream");
    FakeES.all[0]?.onmessage?.();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["comments", 7] });
    FakeES.all[0]?.onerror?.(); // delay 4s
    expect(FakeES.all[0]?.closed).toBe(true);
    await vi.advanceTimersByTimeAsync(4100);
    expect(FakeES.all).toHaveLength(2);
    FakeES.all[1]?.onopen?.(); // back to 2s base
    FakeES.all[1]?.onerror?.(); // 4s again, not 8s
    await vi.advanceTimersByTimeAsync(4100);
    expect(FakeES.all).toHaveLength(3);
    unmount();
    FakeES.all[2]?.onerror?.(); // after unmount: no more reconnects
    await vi.advanceTimersByTimeAsync(70_000);
    expect(FakeES.all).toHaveLength(3);
  });

  it("caps the delay at one minute", async () => {
    vi.stubGlobal("EventSource", FakeES);
    const { wrapper } = wrap();
    renderHook(() => useLiveComments(1, true), { wrapper });
    await vi.waitFor(() => expect(FakeES.all).toHaveLength(1));
    for (let i = 0; i < 7; i++) {
      FakeES.all.at(-1)?.onerror?.();
      await vi.advanceTimersByTimeAsync(61_000);
    }
    expect(FakeES.all.length).toBe(8);
  });

  it("retries when the ticket request fails", async () => {
    vi.stubGlobal("EventSource", FakeES);
    tokens.set({ token: "t", expiresAt: "x" });
    let calls = 0;
    server.use(
      http.post(api("/me/stream-ticket"), () =>
        ++calls === 1 ? HttpResponse.json({ error: "x" }, { status: 500 }) : HttpResponse.json({ data: { ticket: "tk", expires_in: 30 } }),
      ),
    );
    const { wrapper } = wrap();
    const { unmount } = renderHook(() => useLiveNotifications(), { wrapper });
    await vi.waitFor(() => expect(calls).toBe(1));
    await vi.advanceTimersByTimeAsync(4100);
    await vi.waitFor(() => expect(FakeES.all).toHaveLength(1));
    unmount();
  });

  it("a failing ticket after unmount does not retry", async () => {
    vi.stubGlobal("EventSource", FakeES);
    tokens.set({ token: "t", expiresAt: "x" });
    let calls = 0;
    server.use(http.post(api("/me/stream-ticket"), () => (calls++, HttpResponse.json({ error: "x" }, { status: 500 }))));
    const { wrapper } = wrap();
    const { unmount } = renderHook(() => useLiveNotifications(), { wrapper });
    unmount();
    await vi.advanceTimersByTimeAsync(70_000);
    expect(calls).toBeLessThanOrEqual(1);
  });

  it("does nothing without EventSource or when disabled", async () => {
    vi.stubGlobal("EventSource", undefined);
    const { wrapper } = wrap();
    renderHook(() => useLiveComments(1, true), { wrapper });
    vi.stubGlobal("EventSource", FakeES);
    renderHook(() => useLiveComments(1, false), { wrapper });
    renderHook(() => useLiveNotifications(), { wrapper }); // signed out
    await vi.advanceTimersByTimeAsync(100);
    expect(FakeES.all).toHaveLength(0);
  });
});

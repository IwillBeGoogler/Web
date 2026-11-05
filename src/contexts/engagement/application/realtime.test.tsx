import { QueryClientProvider } from "@tanstack/react-query";
import { renderHook } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { testQueryClient } from "@/test/render";
import { api, server } from "@/test/server";
import { useLiveComments, useLiveNotifications } from "./realtime";

class FakeES {
  static last: FakeES | null = null;
  onmessage: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onopen: (() => void) | null = null;
  closed = false;
  constructor(public url: string) {
    FakeES.last = this;
  }
  close() {
    this.closed = true;
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  tokens.set(null);
});

describe("realtime", () => {
  it("notifications use a single-use ticket and refresh on events", async () => {
    vi.stubGlobal("EventSource", FakeES);
    tokens.set({ token: "t", expiresAt: "x" });
    server.use(http.post(api("/me/stream-ticket"), () => HttpResponse.json({ data: { ticket: "tk1", expires_in: 30 } })));
    const qc = testQueryClient();
    const spy = vi.spyOn(qc, "invalidateQueries");
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { unmount } = renderHook(() => useLiveNotifications(), { wrapper });
    await vi.waitFor(() => expect(FakeES.last?.url).toBe("/api/me/notifications/stream?ticket=tk1"));
    expect(FakeES.last?.url).not.toContain("t&");
    FakeES.last?.onmessage?.();
    expect(spy).toHaveBeenCalledWith({ queryKey: ["notifications"] });
    const es = FakeES.last;
    unmount();
    expect(es?.closed).toBe(true);
  });
  it("comments stream only while open", async () => {
    vi.stubGlobal("EventSource", FakeES);
    FakeES.last = null;
    const qc = testQueryClient();
    const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
    const { rerender } = renderHook(({ on }) => useLiveComments(7, on), { wrapper, initialProps: { on: false } });
    expect(FakeES.last).toBeNull();
    rerender({ on: true });
    await vi.waitFor(() => expect(FakeES.last?.url).toBe("/api/posts/7/comments/stream"));
  });
});

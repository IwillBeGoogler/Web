import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTracking, track, useReadTime } from "./analytics";
import { tokens } from "./api";
import { consent } from "./consent";

const sent = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => JSON.parse(c[1].body as string));

describe("track", () => {
  afterEach(() => {
    consent.reset();
    resetTracking();
  });

  it("sends nothing without consent", () => {
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    track({ name: "page_view", path: "/" }, f);
    consent.set("necessary");
    track({ name: "page_view", path: "/a" }, f);
    expect(f).not.toHaveBeenCalled();
    expect(localStorage.getItem("iwillbegoogler.visitor")).toBeNull();
  });

  it("sends with a stable visitor id after consent, once per path", () => {
    consent.set("all");
    const f = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    track({ name: "page_view", path: "/" }, f);
    track({ name: "page_view", path: "/" }, f);
    track({ name: "read_time", post_id: 7, value: 42 }, f);
    const [a, b] = sent(f);
    expect(f).toHaveBeenCalledTimes(2);
    expect(f.mock.calls[0]?.[0]).toBe("/api/events");
    expect(a).toMatchObject({ name: "page_view", path: "/" });
    expect(b).toMatchObject({ name: "read_time", post_id: 7, value: 42 });
    expect(a.visitor).toBe(b.visitor);
    expect(a.visitor).toMatch(/^[A-Za-z0-9-]{8,64}$/);
  });

  it("forgets the visitor id when consent is withdrawn", () => {
    consent.set("all");
    track({ name: "signup_open" }, vi.fn().mockResolvedValue(new Response()));
    expect(localStorage.getItem("iwillbegoogler.visitor")).not.toBeNull();
    consent.set("necessary");
    expect(localStorage.getItem("iwillbegoogler.visitor")).toBeNull();
  });
});

describe("track edge cases", () => {
  afterEach(() => {
    consent.reset();
    resetTracking();
    tokens.set(null);
    vi.restoreAllMocks();
  });

  it("adds the bearer token and swallows send failures", async () => {
    consent.set("all");
    tokens.set({ token: "tk", expiresAt: "2030-01-01T00:00:00Z" });
    const f = vi.fn().mockRejectedValue(new Error("offline"));
    track({ name: "signup_open" }, f);
    const [, init] = f.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tk");
    await Promise.resolve();
  });

  it("sends nothing when storage is unavailable", () => {
    consent.set("all");
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const f = vi.fn();
    track({ name: "signup_open" }, f);
    expect(f).not.toHaveBeenCalled();
  });

  it("survives storage errors when consent is withdrawn", () => {
    consent.set("all");
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() => consent.set("necessary")).not.toThrow();
  });

  it("uses the global fetch by default", () => {
    consent.set("all");
    const f = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", f);
    track({ name: "signup_open" });
    expect(f).toHaveBeenCalledWith("/api/events", expect.objectContaining({ method: "POST" }));
    vi.unstubAllGlobals();
  });
});

describe("useReadTime", () => {
  const setVisibility = (v: "visible" | "hidden") => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => v });
    document.dispatchEvent(new Event("visibilitychange"));
  };
  const spy = () => {
    consent.set("all");
    const f = vi.fn().mockResolvedValue(new Response());
    vi.stubGlobal("fetch", f);
    return f;
  };
  afterEach(() => {
    consent.reset();
    resetTracking();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("does nothing without a post id", () => {
    const f = spy();
    renderHook(() => useReadTime(undefined)).unmount();
    expect(f).not.toHaveBeenCalled();
  });

  it("reports visible seconds on unmount, pagehide and hide, skipping short reads", () => {
    vi.useFakeTimers();
    const f = spy();
    const { unmount } = renderHook(() => useReadTime(7));
    vi.advanceTimersByTime(5000);
    setVisibility("hidden"); // flush 5s
    expect(f).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000); // hidden: not counted
    setVisibility("visible");
    vi.advanceTimersByTime(4000);
    window.dispatchEvent(new Event("pagehide")); // 4s
    expect(f).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(1000);
    unmount(); // 1s: too short
    expect(f).toHaveBeenCalledTimes(2);
    const values = f.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).value);
    expect(values).toEqual([5, 4]);
  });

  it("starts the clock at zero when mounted in a hidden tab", () => {
    vi.useFakeTimers();
    const f = spy();
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
    const { unmount } = renderHook(() => useReadTime(7));
    vi.advanceTimersByTime(10_000);
    unmount();
    expect(f).not.toHaveBeenCalled();
  });
});

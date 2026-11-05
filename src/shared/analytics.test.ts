import { afterEach, describe, expect, it, vi } from "vitest";
import { resetTracking, track } from "./analytics";
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
    expect(localStorage.getItem("iblog.visitor")).toBeNull();
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
    expect(localStorage.getItem("iblog.visitor")).not.toBeNull();
    consent.set("necessary");
    expect(localStorage.getItem("iblog.visitor")).toBeNull();
  });
});

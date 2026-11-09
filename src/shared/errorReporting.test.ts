import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/shared/http";
import { reportError, resetErrorReporting, scrub } from "./errorReporting";

const fresh = () => vi.fn().mockResolvedValue(undefined);
const bodies = (f: ReturnType<typeof vi.fn>) => f.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string));
const err = (message: string, stack = `Error: ${message}\n    at f (https://x.test/assets/app.js:1:1)`) => Object.assign(new Error(message), { stack });

describe("reportError", () => {
  beforeEach(() => resetErrorReporting());

  it("does nothing outside production unless a sender is injected", () => {
    expect(() => reportError(err("boom"))).not.toThrow();
  });

  it("skips noise", () => {
    const f = fresh();
    const abort = new DOMException("The user aborted a request.", "AbortError");
    const ext = err("ext", "Error: ext\n    at a (chrome-extension://abc/c.js:1:1)\n    at b (moz-extension://def/d.js:2:2)");
    const noise: unknown[] = [
      err("ResizeObserver loop completed with undelivered notifications."),
      err("Script error.", ""),
      abort,
      new ApiError(500),
      new NetworkError({ method: "GET", path: "/x" }),
      ext,
      "",
      undefined,
    ];
    for (const n of noise) reportError(n, { send: f });
    expect(f).not.toHaveBeenCalled();
    reportError(err("real"), { send: f }); // one frame from the page keeps it
    reportError(err("mixed", "Error: mixed\n    at a (chrome-extension://abc/c.js:1:1)\n    at b (https://x.test/a.js:1:1)"), { send: f });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("sends an error once per message and first stack line", () => {
    const f = fresh();
    reportError(err("boom"), { send: f });
    reportError(err("boom"), { send: f });
    reportError(err("boom", "Error: boom\n    at g (https://x.test/assets/other.js:9:9)"), { send: f });
    reportError(err("other"), { send: f });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it("sends at most 10 reports per page session", () => {
    const f = fresh();
    for (let i = 0; i < 25; i++) reportError(err(`distinct ${i}`), { send: f });
    expect(f).toHaveBeenCalledTimes(10);
  });

  it("sends only message, stack, page address and user agent, without credentials", () => {
    const f = fresh();
    window.history.pushState({}, "", "/d/s/secrettoken?reset=abc#frag");
    reportError(err("fail for me@example.com"), { send: f });
    const [url, init] = f.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/client-errors");
    expect(init.keepalive).toBe(true);
    expect(init.credentials).toBe("omit");
    expect(Object.keys(init.headers as object)).toEqual(["Content-Type"]);
    const [b] = bodies(f);
    expect(Object.keys(b).sort()).toEqual(["message", "page_url", "stack", "user_agent"]);
    expect(b.message).toBe("fail for [redacted]");
    expect(b.page_url).toBe(`${location.origin}/d/s/…`);
    expect(b.user_agent).toBe(navigator.userAgent);
  });

  it("swallows a failing or throwing sender", async () => {
    const rejecting = vi.fn().mockRejectedValue(new Error("offline"));
    const throwing = vi.fn(() => {
      throw new Error("sync");
    });
    expect(() => reportError(err("a"), { send: rejecting })).not.toThrow();
    expect(() => reportError(err("b"), { send: throwing })).not.toThrow();
    await Promise.resolve();
    expect(rejecting).toHaveBeenCalled();
  });
});

describe("scrub", () => {
  it("removes emails, tokens and URL queries", () => {
    expect(scrub("a@b.co")).toBe("[redacted]");
    expect(scrub("Authorization: Bearer abc.def")).toBe("Authorization: [redacted]");
    expect(scrub("id 0123456789abcdef0123456789abcdef0123")).toBe("id [redacted]");
    expect(scrub("GET https://x.test/a?token=1#h failed")).toBe("GET https://x.test/a failed");
    expect(scrub("at f (https://x.test/a.js?v=3:10:5)")).toBe("at f (https://x.test/a.js:10:5)");
  });
});

describe("describe() shapes and production default", () => {
  beforeEach(() => resetErrorReporting());

  it("handles strings, plain objects and other values", () => {
    const f = fresh();
    reportError("just a string", { send: f });
    reportError({ name: "Custom", message: "obj message", stack: "at x (https://x.test/a.js:1:1)" }, { send: f });
    reportError({ name: 5, message: "bad name", stack: 7 }, { send: f });
    reportError({ message: 9 }, { send: f });
    reportError(42, { send: f });
    expect(bodies(f).map((b) => b.message)).toEqual(["just a string", "obj message", "bad name"]);
  });

  it("falls back to fetch in production", () => {
    vi.stubEnv("PROD", true);
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    reportError(err("prod boom"));
    expect(fetchMock).toHaveBeenCalledWith("/api/client-errors", expect.objectContaining({ method: "POST", credentials: "omit" }));
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });
});

describe("installErrorReporting", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("is a no-op without a window", async () => {
    vi.stubGlobal("window", undefined);
    const add = vi.spyOn(globalThis, "addEventListener");
    const m = await import("./errorReporting");
    m.installErrorReporting();
    expect(add).not.toHaveBeenCalled();
  });

  it("reports window errors and unhandled rejections, once installed", async () => {
    vi.stubEnv("PROD", true);
    const fetchMock = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("fetch", fetchMock);
    const m = await import("./errorReporting");
    m.resetErrorReporting();
    m.installErrorReporting();
    m.installErrorReporting(); // second call ignored
    window.dispatchEvent(new ErrorEvent("error", { error: err("from error"), message: "ignored" }));
    window.dispatchEvent(new ErrorEvent("error", { message: "from message only" }));
    const rej = new Event("unhandledrejection");
    Object.assign(rej, { reason: err("from rejection") });
    window.dispatchEvent(rej);
    const messages = fetchMock.mock.calls.map((c) => JSON.parse((c[1] as RequestInit).body as string).message);
    expect(messages).toEqual(["from error", "from message only", "from rejection"]);
  });
});

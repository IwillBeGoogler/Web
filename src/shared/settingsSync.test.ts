import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSettingsSync, SETTINGS_PATH } from "./settingsSync";

const setup = (prefs: Record<string, unknown> | Error, token: unknown = "t") => {
  let tok: unknown = token;
  const listeners = new Set<(t: unknown) => void>();
  const http = vi.fn(async (_p: string, o?: { method?: string; body?: unknown }) => {
    if (o?.method === "PATCH") return { prefs: {} };
    if (prefs instanceof Error) throw prefs;
    return { prefs };
  });
  const tokens = {
    get: () => tok,
    subscribe: (l: (t: unknown) => void) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
  };
  const signIn = (t: unknown) => {
    tok = t;
    for (const l of listeners) l(t);
  };
  return { http, tokens, signIn, sync: createSettingsSync(800) };
};
const patches = (http: ReturnType<typeof setup>["http"]) => http.mock.calls.filter((c) => c[1]?.method === "PATCH").map((c) => c[1]?.body);

describe("settingsSync", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("applies server values on start when signed in (server wins)", async () => {
    const { http, tokens, sync } = setup({ lang: "ru" });
    const apply = vi.fn();
    sync.register({ key: "lang", get: () => "en", apply });
    sync.start({ http, tokens });
    await vi.advanceTimersByTimeAsync(0);
    expect(http).toHaveBeenCalledWith(SETTINGS_PATH);
    expect(apply).toHaveBeenCalledWith("ru");
    expect(patches(http)).toHaveLength(0);
  });

  it("applies a cached server value to a setting registered later", async () => {
    const { http, tokens, sync } = setup({ lang: "ru" });
    sync.start({ http, tokens });
    await vi.advanceTimersByTimeAsync(0);
    const apply = vi.fn();
    sync.register({ key: "lang", get: () => undefined, apply });
    expect(apply).toHaveBeenCalledWith("ru");
  });

  it("pulls on sign-in", async () => {
    const { http, tokens, sync, signIn } = setup({ lang: "uz" }, null);
    const apply = vi.fn();
    sync.register({ key: "lang", get: () => undefined, apply });
    sync.start({ http, tokens });
    await vi.advanceTimersByTimeAsync(0);
    expect(http).not.toHaveBeenCalled();
    signIn("tok");
    await vi.advanceTimersByTimeAsync(0);
    expect(apply).toHaveBeenCalledWith("uz");
  });

  it("seeds the server with local values it lacks", async () => {
    const { http, tokens, sync } = setup({});
    sync.register({ key: "reading", get: () => ({ palette: "carbon" }), apply: vi.fn() });
    sync.register({ key: "unset", get: () => undefined, apply: vi.fn() });
    sync.start({ http, tokens });
    await vi.advanceTimersByTimeAsync(900);
    expect(patches(http)).toEqual([{ reading: { palette: "carbon" } }]);
  });

  it("debounces pushes into one PATCH", async () => {
    const { http, tokens, sync } = setup({});
    sync.start({ http, tokens });
    await vi.advanceTimersByTimeAsync(0);
    sync.push("a", 1);
    await vi.advanceTimersByTimeAsync(500);
    sync.push("b", 2);
    sync.push("a", 3);
    await vi.advanceTimersByTimeAsync(799);
    expect(patches(http)).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(patches(http)).toEqual([{ a: 3, b: 2 }]);
  });

  it("does not push when signed out or when the server already has the value", async () => {
    const out = setup({}, null);
    out.sync.start({ http: out.http, tokens: out.tokens });
    out.sync.push("a", 1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(out.http).not.toHaveBeenCalled();

    const inn = setup({ a: 1 });
    inn.sync.start({ http: inn.http, tokens: inn.tokens });
    await vi.advanceTimersByTimeAsync(0);
    inn.sync.push("a", 1);
    await vi.advanceTimersByTimeAsync(2000);
    expect(patches(inn.http)).toHaveLength(0);
  });

  it("keeps a local change made before the pull finished", async () => {
    const { http, tokens, sync } = setup({ lang: "ru" });
    const apply = vi.fn();
    sync.register({ key: "lang", get: () => "en", apply });
    sync.start({ http, tokens });
    sync.push("lang", "en");
    await vi.advanceTimersByTimeAsync(900);
    expect(apply).not.toHaveBeenCalled();
    expect(patches(http)).toEqual([{ lang: "en" }]);
  });

  it("fails silently on network errors", async () => {
    const { http, tokens, sync } = setup(new Error("offline"));
    const apply = vi.fn();
    sync.register({ key: "lang", get: () => "en", apply });
    sync.start({ http, tokens });
    await vi.advanceTimersByTimeAsync(900);
    expect(apply).not.toHaveBeenCalled();
    http.mockRejectedValue(new Error("offline"));
    sync.push("lang", "ru");
    await vi.advanceTimersByTimeAsync(900);
    expect(patches(http)).toHaveLength(1); // attempted, error swallowed
  });
});

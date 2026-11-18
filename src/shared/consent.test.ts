import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const fresh = async () => {
  vi.resetModules();
  return import("./consent");
};

describe("consent", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it("loads stored 'all' and 'necessary' values, ignoring invalid ones", async () => {
    localStorage.setItem("iwillbegoogler.consent", "all");
    expect((await fresh()).consent.get()).toBe("all");

    localStorage.setItem("iwillbegoogler.consent", "necessary");
    expect((await fresh()).consent.get()).toBe("necessary");

    localStorage.setItem("iwillbegoogler.consent", "other");
    expect((await fresh()).consent.get()).toBeNull();
  });

  it("returns null when localStorage.getItem throws on load", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect((await fresh()).consent.get()).toBeNull();
  });

  it("updates value, notifies subscribers/useConsent, and survives storage errors on set/reset", async () => {
    const { consent, useConsent } = await fresh();
    const { result } = renderHook(() => useConsent());
    expect(result.current).toBeNull();

    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });

    act(() => consent.set("all"));
    expect(result.current).toBe("all");

    act(() => consent.reset());
    expect(result.current).toBeNull();
  });
});

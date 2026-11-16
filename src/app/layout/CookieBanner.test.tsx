import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { consent } from "@/shared/consent";
import { renderRouted } from "@/test/render";
import { CookieBanner } from "./CookieBanner";

describe("CookieBanner & consent", () => {
  beforeEach(() => {
    localStorage.clear();
    consent.reset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    document.documentElement.style.removeProperty("--cookie-h");
  });

  it("renders when consent is null, tracks --cookie-h via ResizeObserver, and hides on choice", async () => {
    const disconnect = vi.fn();
    const observe = vi.fn();
    let cb: ResizeObserverCallback | undefined;
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(fn: ResizeObserverCallback) {
          cb = fn;
        }
        observe = observe;
        disconnect = disconnect;
        unobserve() {}
      },
    );
    await renderRouted(<CookieBanner />);
    const region = await screen.findByRole("region", { name: /cookies/i });
    expect(observe).toHaveBeenCalledWith(region);
    cb?.([] as never, {} as never);
    fireEvent(window, new Event("resize"));
    expect(document.documentElement.style.getPropertyValue("--cookie-h")).toMatch(/px$/);
    fireEvent.click(screen.getAllByRole("button")[0] as HTMLElement);
    expect(consent.get()).toBe("necessary");
    expect(disconnect).toHaveBeenCalled();
    expect(screen.queryByRole("region", { name: /cookies/i })).toBeNull();

    consent.reset();
    await renderRouted(<CookieBanner />);
    fireEvent.click(screen.getAllByRole("button")[1] as HTMLElement);
    expect(consent.get()).toBe("all");
  });

  it("works without ResizeObserver and survives localStorage errors", async () => {
    vi.stubGlobal("ResizeObserver", undefined);
    await renderRouted(<CookieBanner />);
    expect(await screen.findByRole("region", { name: /cookies/i })).toBeInTheDocument();

    const orig = Object.getOwnPropertyDescriptor(globalThis, "localStorage");
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      get() {
        throw new Error("denied");
      },
    });
    try {
      consent.set("all");
      expect(consent.get()).toBe("all");
      consent.reset();
      expect(consent.get()).toBeNull();
    } finally {
      if (orig) Object.defineProperty(globalThis, "localStorage", orig);
    }
  });
});

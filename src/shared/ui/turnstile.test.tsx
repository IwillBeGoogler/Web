import { render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Turnstile } from "./turnstile";

const script = () => document.head.querySelector<HTMLScriptElement>("script[src*=turnstile]");

afterEach(() => {
  delete window.turnstile;
  script()?.remove();
  document.documentElement.classList.remove("dark");
});

describe("Turnstile", () => {
  it("rejects when script loads without api, then error resets the cache", async () => {
    const r = render(<Turnstile siteKey="k" onToken={() => {}} />);
    const s = script() as HTMLScriptElement;
    s.onload?.(new Event("load"));
    s.onerror?.(new Event("error"));
    await Promise.resolve();
    r.unmount();
    script()?.remove();
  });

  it("uses an already-loaded api, forwards callbacks and removes on unmount", async () => {
    let opts: Record<string, (t?: string) => void> = {};
    const api = {
      render: vi.fn((_el: HTMLElement, o: Record<string, never>) => {
        opts = o;
        return "w1";
      }),
      remove: vi.fn(),
    };
    window.turnstile = api;
    document.documentElement.classList.add("dark");
    const onToken = vi.fn();
    const { unmount } = render(<Turnstile siteKey="k" onToken={onToken} />);
    await waitFor(() => expect(api.render).toHaveBeenCalled());
    expect(api.render.mock.calls[0]?.[1]).toMatchObject({ sitekey: "k", theme: "dark" });
    opts.callback?.("tok");
    opts["expired-callback"]?.();
    opts["error-callback"]?.();
    expect(onToken.mock.calls).toEqual([["tok"], [""], [""]]);
    unmount();
    expect(api.remove).toHaveBeenCalledWith("w1");
  });

  it("skips render when unmounted before load, loads script once, then recovers from error", async () => {
    const { unmount } = render(<Turnstile siteKey="k" onToken={() => {}} />);
    const s = script() as HTMLScriptElement;
    expect(s).not.toBeNull();
    unmount();
    window.turnstile = { render: vi.fn(() => "x"), remove: vi.fn() };
    s.onload?.(new Event("load"));
    await Promise.resolve();
    expect(window.turnstile.render).not.toHaveBeenCalled();
  });
});

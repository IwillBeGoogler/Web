import { act, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = { fail: false };
vi.mock("./HeroScene", () => ({
  get default() {
    if (state.fail) throw new Error("chunk");
    return () => <div data-testid="scene" />;
  },
}));

import { LazyHeroScene } from "./LazyHeroScene";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  state.fail = false;
});

describe("LazyHeroScene", () => {
  it("shows fallback then scene after idle callback", async () => {
    let cb: () => void = () => {};
    const cancel = vi.fn();
    vi.stubGlobal("requestIdleCallback", (f: () => void) => {
      cb = f;
      return 7;
    });
    vi.stubGlobal("cancelIdleCallback", cancel);
    const { container, unmount } = render(<LazyHeroScene />);
    expect(container.querySelector("svg")).toBeTruthy();
    await act(async () => cb());
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    unmount();
    expect(cancel).toHaveBeenCalledWith(7);
  });

  it("falls back to setTimeout without requestIdleCallback", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    const { unmount } = render(<LazyHeroScene />);
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();
    expect(await screen.findByTestId("scene")).toBeInTheDocument();
    unmount();
  });

  it("keeps static fallback when chunk fails", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("requestIdleCallback", undefined);
    state.fail = true;
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { container } = render(<LazyHeroScene />);
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    vi.useRealTimers();
    await act(async () => {});
    expect(screen.queryByTestId("scene")).toBeNull();
    expect(container.querySelector("svg")).toBeTruthy();
    err.mockRestore();
  });
});

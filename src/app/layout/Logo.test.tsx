import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderRouted } from "@/test/render";
import { HOME_REPLAY, Logo } from "./Logo";

vi.mock("@/shared/splash", () => ({ playSplash: vi.fn() }));

import { playSplash } from "@/shared/splash";

afterEach(() => vi.restoreAllMocks());

describe("Logo", () => {
  it("is the wordmark linking home", async () => {
    await renderRouted(<Logo />);
    const link = screen.getByRole("link", { name: "IWillBeGoogler home" });
    expect(link).toHaveAttribute("href", "/");
    expect(link).toHaveTextContent("iBlog");
  });

  it("replays home entrance on plain click", async () => {
    window.scrollTo = vi.fn() as never;
    const replay = vi.fn();
    addEventListener(HOME_REPLAY, replay);
    await renderRouted(<Logo />);
    fireEvent.click(screen.getByRole("link"));
    expect(replay).toHaveBeenCalled();
    expect(playSplash).not.toHaveBeenCalled();
    removeEventListener(HOME_REPLAY, replay);
  });

  it("plays splash when not on home", async () => {
    window.scrollTo = vi.fn() as never;
    history.pushState({}, "", "/elsewhere");
    await renderRouted(<Logo />, { path: "/elsewhere" });
    fireEvent.click(screen.getByRole("link"));
    expect(playSplash).toHaveBeenCalled();
    history.pushState({}, "", "/");
  });

  it("ignores modifier / middle clicks", async () => {
    const replay = vi.fn();
    addEventListener(HOME_REPLAY, replay);
    await renderRouted(<Logo />);
    const link = screen.getByRole("link");
    fireEvent.click(link, { ctrlKey: true });
    fireEvent.click(link, { button: 1 });
    expect(replay).not.toHaveBeenCalled();
    removeEventListener(HOME_REPLAY, replay);
  });
});

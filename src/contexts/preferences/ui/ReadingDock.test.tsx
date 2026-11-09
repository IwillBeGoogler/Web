import { screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderRouted } from "@/test/render";
import { readingPrefs } from "../application/store";
import { ReadingControls, ReadingDock } from "./ReadingPanel";

afterEach(() => {
  readingPrefs.reset();
  vi.restoreAllMocks();
  Reflect.deleteProperty(document, "fullscreenElement");
});

describe("ReadingDock", () => {
  it("opens, picks a swatch, resets", async () => {
    const { user } = await renderRouted(<ReadingDock />);
    await user.click(screen.getByRole("button", { name: "Reading settings" }));
    await user.click(await screen.findByRole("radio", { name: "Paper" }));
    expect(readingPrefs.get().palette).toBe("paper");
    expect(screen.getByRole("radio", { name: "Paper" })).toBeChecked();
    await user.click(screen.getByRole("button", { name: "Reset to defaults" }));
    expect(readingPrefs.get().palette).toBe("galaxy");
  });
});

describe("ReadingControls extras", () => {
  it("toggles bold, focus, margin, smaller text, renders footer", async () => {
    const { user } = await renderRouted(<ReadingControls footer={<span>foot</span>} />);
    expect(screen.getByText("foot")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Bold text" }));
    await user.click(screen.getByRole("switch", { name: "Focus mode" }));
    await user.click(screen.getByRole("button", { name: "Narrower margin" }));
    await user.click(screen.getByRole("button", { name: "Smaller text" }));
    expect(readingPrefs.get()).toMatchObject({ bold: true, focus: true, typeStep: -1, measureStep: 1 });
  });

  it("full screen toggles through the Fullscreen API", async () => {
    const req = vi.fn(() => Promise.resolve());
    const exit = vi.fn(() => Promise.resolve());
    document.documentElement.requestFullscreen = req;
    document.exitFullscreen = exit;
    const { user } = await renderRouted(<ReadingControls />);
    const sw = screen.getByRole("switch", { name: "Full screen" });
    await user.click(sw);
    expect(req).toHaveBeenCalled();
    Object.defineProperty(document, "fullscreenElement", { configurable: true, value: document.documentElement });
    document.dispatchEvent(new Event("fullscreenchange"));
    await vi.waitFor(() => expect(screen.getByRole("switch", { name: "Full screen" })).toHaveAttribute("aria-checked", "true"));
    await user.click(screen.getByRole("switch", { name: "Full screen" }));
    expect(exit).toHaveBeenCalled();
  });

  it("tolerates missing requestFullscreen and no fullscreen element on exit", async () => {
    // @ts-expect-error simulate unsupported
    document.documentElement.requestFullscreen = undefined;
    const { user } = await renderRouted(<ReadingControls />);
    await user.click(screen.getByRole("switch", { name: "Full screen" }));
    document.documentElement.requestFullscreen = vi.fn(() => Promise.reject(new Error("no")));
    await user.click(screen.getByRole("switch", { name: "Full screen" }));
    document.dispatchEvent(new Event("fullscreenchange"));
    await user.click(screen.getByRole("switch", { name: "Full screen" }));
  });
});

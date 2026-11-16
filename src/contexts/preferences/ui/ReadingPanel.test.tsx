import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderRouted } from "@/test/render";
import { readingPrefs } from "../application/store";
import { Bio } from "./BionicText";
import { clearBionic } from "./bionic";
import { ReadingControls } from "./ReadingPanel";

describe("ReadingControls", () => {
  it("changes palette, size, margin and switches", async () => {
    readingPrefs.reset();
    const { user } = await renderRouted(<ReadingControls />);
    await user.selectOptions(screen.getByLabelText("Theme"), "nord");
    expect(readingPrefs.get().palette).toBe("nord");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    await user.click(screen.getByRole("button", { name: "Larger text" }));
    await user.click(screen.getByRole("button", { name: "Wider margin" }));
    expect(readingPrefs.get()).toMatchObject({ typeStep: 1, measureStep: -1 });
    await user.click(screen.getByRole("switch", { name: "Bionic reading" }));
    expect(screen.getByRole("switch", { name: "Bionic reading" })).toHaveAttribute("aria-checked", "true");
    await user.selectOptions(screen.getByLabelText("Font"), "lora");
    expect(readingPrefs.get().typeface).toBe("lora");
    readingPrefs.reset();
  });
  it("disables size buttons at the limits", async () => {
    readingPrefs.reset();
    readingPrefs.set({ typeStep: 4 });
    await renderRouted(<ReadingControls />);
    expect(screen.getByRole("button", { name: "Larger text" })).toBeDisabled();
    readingPrefs.reset();
  });

  it("toggles fullscreen and exercises Bio + clearBionic edge cases", async () => {
    readingPrefs.reset();
    const reqFs = vi.fn().mockResolvedValue(undefined);
    const exitFs = vi.fn().mockResolvedValue(undefined);
    document.documentElement.requestFullscreen = reqFs;
    document.exitFullscreen = exitFs;
    let fsEl: Element | null = null;
    Object.defineProperty(document, "fullscreenElement", { configurable: true, get: () => fsEl });

    const { user } = await renderRouted(
      <>
        <ReadingControls />
        <Bio>{""}</Bio>
        <Bio>{"a! x"}</Bio>
      </>,
    );
    const fsBtn = screen.getByRole("switch", { name: /full screen/i });
    await user.click(fsBtn);
    expect(reqFs).toHaveBeenCalled();
    fsEl = document.documentElement;
    fireEvent(document, new Event("fullscreenchange"));
    await user.click(fsBtn);
    expect(exitFs).toHaveBeenCalled();

    readingPrefs.set({ bionic: true });
    expect(document.body.textContent).toContain("a!");
    const div = document.createElement("div");
    div.innerHTML = '<b class="bionic"></b><b class="bionic">Re</b>ad';
    clearBionic(div);
    expect(div.textContent).toBe("Read");

    fsEl = null;
    fireEvent(document, new Event("fullscreenchange"));
    readingPrefs.reset();
  });
});

import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderRouted } from "@/test/render";
import { readingPrefs } from "../application/store";
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
});

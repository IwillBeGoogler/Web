import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/motion", () => ({ useReducedMotion: () => true }));

import { Carousel } from "./carousel";

describe("Carousel (reduced motion)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses auto scroll behavior and skips autoplay when reduced motion is preferred", async () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(0);
    const scrollTo = vi.fn();
    HTMLElement.prototype.scrollTo = scrollTo as never;

    render(
      <Carousel label="c" autoplay={50}>
        <p key="1">one</p>
        <p key="2">two</p>
      </Carousel>,
    );

    await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    expect(scrollTo).toHaveBeenCalledWith(expect.objectContaining({ behavior: "auto" }));
  });
});

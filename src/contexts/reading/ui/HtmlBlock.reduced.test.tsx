import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/shared/motion", () => ({ useReducedMotion: () => true }));

const { HtmlBlock } = await import("./HtmlBlock");

describe("HtmlBlock with reduced motion", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("waits for a click before running, treats an empty observer entry as near", () => {
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
        observe() {
          this.cb([]);
        }
        disconnect() {}
      },
    );
    render(<HtmlBlock html="x" height={200} />);
    expect(screen.queryByTitle("Interactive content")).toBeNull();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByTitle("Interactive content")).toBeInTheDocument();
  });
});

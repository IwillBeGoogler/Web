import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HtmlBlock } from "./HtmlBlock";

function stubIntersection(visible: boolean) {
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
      observe() {
        this.cb([{ isIntersecting: visible }]);
      }
      disconnect() {}
    },
  );
}

describe("HtmlBlock", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("removes the frame while far off screen", () => {
    stubIntersection(false);
    render(<HtmlBlock html="x" height={200} />);
    expect(screen.queryByTitle("Interactive content")).toBeNull();
  });
  it("frames the HTML with exactly allow-scripts and posts it on load", () => {
    stubIntersection(true);
    render(<HtmlBlock html={"<script>1</script>"} height={300} />);
    const frame = screen.getByTitle("Interactive content") as HTMLIFrameElement;
    expect(frame.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame.getAttribute("src")).toBe("/html-frame.html");
    expect(frame.getAttribute("referrerpolicy")).toBe("no-referrer");
    expect(frame.getAttribute("allow")).toBe("");
    expect(frame.getAttribute("srcdoc")).toBeNull();
    expect(frame.style.height).toBe("300px");
    const post = vi.fn();
    Object.defineProperty(frame, "contentWindow", { value: { postMessage: post } });
    fireEvent.load(frame);
    expect(post).toHaveBeenCalledWith("<script>1</script>", "*");
    // the markup is never put in this page
    expect(document.body.innerHTML).not.toContain("<script>1");
  });
  it("clamps the height", () => {
    stubIntersection(true);
    render(<HtmlBlock html="x" height={99999} />);
    expect((screen.getByTitle("Interactive content") as HTMLIFrameElement).style.height).toBe("1000px");
  });
});

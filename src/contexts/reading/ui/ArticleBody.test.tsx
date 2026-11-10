import { render } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { safeHtml } from "../domain/sanitize";
import { ArticleBody } from "./ArticleBody";

describe("ArticleBody", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("turns a live block into a sandboxed frame without putting its source in the page", async () => {
    const html = safeHtml('<p>hi</p><pre><code class="language-html-live-250">&lt;script&gt;window.x=1&lt;/script&gt;&lt;b&gt;z&lt;/b&gt;</code></pre>');
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(private cb: (e: { isIntersecting: boolean }[]) => void) {}
        observe() {
          this.cb([{ isIntersecting: true }]);
        }
        disconnect() {}
      },
    );
    const { container } = render(<ArticleBody html={html} />);
    const frame = container.querySelector("iframe");
    expect(frame?.getAttribute("sandbox")).toBe("allow-scripts");
    expect(frame?.style.height).toBe("250px");
    expect(container.querySelector("script")).toBeNull();
    expect(container.innerHTML).not.toContain("window.x");
    expect(container.querySelector("p")?.textContent).toBe("hi");
  });

  it("hands the body element to a callback or an object ref", () => {
    const html = safeHtml("<p>x</p>");
    const seen = vi.fn();
    render(<ArticleBody html={html} bodyRef={seen} />);
    expect(seen.mock.calls[0]?.[0]).toBeInstanceOf(HTMLElement);
    const ref = createRef<HTMLDivElement>();
    render(<ArticleBody html={html} bodyRef={ref} />);
    expect(ref.current?.textContent).toBe("x");
  });
});

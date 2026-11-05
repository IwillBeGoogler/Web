import { render } from "@testing-library/react";
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
});

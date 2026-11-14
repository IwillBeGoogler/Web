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

  it("underlines the first mention of each term, outside code and links, and leaves the HTML string alone", () => {
    const html = safeHtml("<h2>Pod</h2><p>A Pod and a Pod. <a href='/x'>Node</a> <code>Node</code></p><p>Node again</p><pre><code>Pod</code></pre>");
    const terms = [
      { id: "a:0", term: "Pod", aliases: [], definition: "d1" },
      { id: "g:1", term: "Node", aliases: [], definition: "d2" },
    ];
    const { container, rerender } = render(<ArticleBody html={html} terms={terms} />);
    const spans = [...container.querySelectorAll(".glossary-term")];
    expect(spans.map((e) => e.textContent)).toEqual(["Pod", "Node"]);
    expect(spans[0]?.closest("p")?.textContent).toBe("A Pod and a Pod. Node Node");
    expect(spans[1]?.closest("p")?.textContent).toBe("Node again");
    // new terms for the same markup: marked again, not doubled
    rerender(<ArticleBody html={html} terms={[terms[1] as (typeof terms)[number]]} />);
    expect([...container.querySelectorAll(".glossary-term")].map((e) => e.textContent)).toEqual(["Node"]);
    rerender(<ArticleBody html={html} />);
    expect(container.querySelector(".glossary-term")).toBeNull();
    // new markup
    rerender(<ArticleBody html={safeHtml("<p>Pod only</p>")} terms={terms} />);
    expect(container.querySelectorAll(".glossary-term")).toHaveLength(1);
  });

  it("does not mark anything inside a live block or code tabs host", () => {
    const html = safeHtml('<p>x</p><pre><code class="language-js">Pod = 1</code></pre>');
    const { container } = render(<ArticleBody html={html} terms={[{ id: "a:0", term: "Pod", aliases: [], definition: "d" }]} />);
    expect(container.querySelector(".glossary-term")).toBeNull();
  });
});

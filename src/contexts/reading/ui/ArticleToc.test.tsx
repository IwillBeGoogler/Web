import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ArticleToc } from "./ArticleToc";

type Cb = (e: { target: Element; isIntersecting: boolean }[]) => void;
let fire: Cb = () => {};
class FakeIO {
  constructor(cb: Cb) {
    fire = cb;
  }
  observe() {}
  disconnect() {}
}

function Page({ html }: { html: string }) {
  const ref = { current: null as HTMLDivElement | null };
  return (
    <>
      <ArticleToc container={ref} deps={html} />
      <div
        ref={(el) => {
          ref.current = el;
        }}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: fixed test markup
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </>
  );
}

const THREE = "<h1>Intro</h1><p>a</p><h2>Part one</h2><h2>Part one</h2><h3>Deep</h3>";

describe("ArticleToc", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("lists h1–h3 with unique ids, nests by level, and marks the section being read", () => {
    vi.stubGlobal("IntersectionObserver", FakeIO);
    const { container } = render(<Page html={THREE} />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["Intro", "Part one", "Part one", "Deep"]);
    const ids = Array.from(container.querySelectorAll("h1, h2, h3")).map((h) => h.id);
    expect(new Set(ids).size).toBe(4);
    const scroll = vi.fn();
    (container.querySelector("h2") as HTMLElement).scrollIntoView = scroll;
    fireEvent.click(links[1] as HTMLElement);
    expect(scroll).toHaveBeenCalled();
    act(() => fire([{ target: container.querySelector("h3") as Element, isIntersecting: true }]));
    expect(links[3]?.getAttribute("aria-current")).toBe("location");
    act(() => fire([{ target: container.querySelector("h3") as Element, isIntersecting: false }]));
    expect(links[3]?.getAttribute("aria-current")).toBe("location");
  });

  it("stays out of the way for short stories and without an IntersectionObserver", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<Page html="<h2>One</h2><h2>Two</h2>" />);
    expect(screen.queryByRole("navigation")).toBeNull();
    render(<Page html={"<h2>日本語</h2><h2>!!!</h2><h2>x</h2>"} />);
    expect(screen.getAllByRole("link")).toHaveLength(3);
  });

  it("ignores null container ref and preserves existing heading ids", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    render(<ArticleToc container={{ current: null }} deps="x" />);
    expect(screen.queryByRole("navigation")).toBeNull();

    const { container } = render(<Page html='<div id="intro"></div><h2 id="custom-id">Custom</h2><h2>Intro</h2><h2>Third</h2>' />);
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["#custom-id", "#intro-2", "#third"]);
    expect(container.querySelector("h2")?.id).toBe("custom-id");
  });
});

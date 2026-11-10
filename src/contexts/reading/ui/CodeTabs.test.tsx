import { fireEvent, render, screen } from "@testing-library/react";
import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { codeLang } from "../domain/codeLang";
import { safeHtml } from "../domain/sanitize";
import { ArticleBody } from "./ArticleBody";

const pre = (lang: string, code: string) => `<pre><code class="language-${lang}">${code}</code></pre>`;
const group = (...p: string[]) => `<div class="code-tabs">${p.join("")}</div>`;

describe("code in an article", () => {
  it("shows language tabs; a pick opens that language in every group and is remembered", () => {
    codeLang.set("");
    const html = safeHtml(group(pre("go", "goA()"), pre("python", "pyA()")) + group(pre("go", "goB()"), pre("python", "pyB()")));
    const { container } = render(<ArticleBody html={html} />);
    expect(screen.getAllByRole("tab", { name: "Go" })).toHaveLength(2);
    expect(container.textContent).toContain("goA()");
    expect(container.textContent).not.toContain("pyA()");
    fireEvent.click(screen.getAllByRole("tab", { name: "Python" })[1] as HTMLElement);
    expect(container.textContent).toContain("pyA()");
    expect(container.textContent).toContain("pyB()");
    expect(container.textContent).not.toContain("goA()");
    expect(codeLang.get()).toBe("python");
    expect(screen.getAllByRole("tab", { selected: true }).map((e) => e.textContent)).toEqual(["Python", "Python"]);
  });
  it("shows a lone block with its language and a copy button, no tabs", () => {
    codeLang.set("");
    render(<ArticleBody html={safeHtml(pre("rust", "fn main() {}"))} />);
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.getByText("Rust")).toBeTruthy();
    expect(screen.getByRole("button", { name: /copy|nusxa|копир/i })).toBeTruthy();
  });
  it("opens on the reader's remembered language when the group has it", () => {
    codeLang.set("python");
    const { container } = render(<ArticleBody html={safeHtml(group(pre("go", "goA()"), pre("py", "pyA()")))} />);
    expect(container.textContent).toContain("pyA()");
    codeLang.set("");
  });

  it("moves between tabs with the arrow, Home and End keys", () => {
    codeLang.set("");
    render(<ArticleBody html={safeHtml(group(pre("go", "a"), pre("python", "b"), pre("rust", "c")))} />);
    const selected = () => screen.getByRole("tab", { selected: true }).textContent;
    const tab = () => screen.getByRole("tab", { selected: true });
    fireEvent.keyDown(tab(), { key: "ArrowRight" });
    expect(selected()).toBe("Python");
    fireEvent.keyDown(tab(), { key: "End" });
    expect(selected()).toBe("Rust");
    fireEvent.keyDown(tab(), { key: "ArrowRight" });
    expect(selected()).toBe("Go");
    fireEvent.keyDown(tab(), { key: "ArrowLeft" });
    expect(selected()).toBe("Rust");
    fireEvent.keyDown(tab(), { key: "Home" });
    expect(selected()).toBe("Go");
    fireEvent.keyDown(tab(), { key: "x" });
    expect(selected()).toBe("Go");
    codeLang.set("");
  });

  it("copies the shown code, then goes back to the label", async () => {
    codeLang.set("");
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    vi.useFakeTimers();
    render(<ArticleBody html={safeHtml(pre("go", "x := 1"))} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(writeText).toHaveBeenCalledWith("x := 1");
    expect(btn.textContent).toMatch(/copied/i);
    await act(async () => {
      vi.advanceTimersByTime(1600);
    });
    expect(btn.textContent).toMatch(/copy/i);
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("survives a clipboard that refuses", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
    render(<ArticleBody html={safeHtml(pre("go", "y"))} />);
    const btn = screen.getByRole("button", { name: /copy/i });
    await act(async () => {
      fireEvent.click(btn);
    });
    expect(btn.textContent).toMatch(/copy/i);
    vi.unstubAllGlobals();
  });

  it("shows highlighted tokens once the grammar loads", async () => {
    codeLang.set("");
    const { container } = render(<ArticleBody html={safeHtml(pre("go", "func main() {}"))} />);
    await vi.waitFor(() => expect(container.querySelector(".tok-keyword")?.textContent).toBe("func"));
  });
});

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
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
});

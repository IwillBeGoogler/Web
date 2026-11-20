import { describe, expect, it } from "vitest";
import { gridTextToMarkdown, htmlTablesToMarkdown } from "./pasteTable";

describe("htmlTablesToMarkdown", () => {
  it("turns a real table into a GFM table", () => {
    const md = htmlTablesToMarkdown("<table><tr><th>A</th><th>B</th></tr><tr><td>1</td><td>2|3</td></tr></table>");
    expect(md).toBe("| A | B |\n| --- | --- |\n| 1 | 2\\|3 |");
  });

  it("turns a grid of div rows into a table, keeping the titles", () => {
    const row = (k: string, n: number) => `<div><span>${k}</span>${[0, 1, 2, 3].map((i) => `<div>${k}${n + i}</div>`).join("")}</div>`;
    const block = (t: string, n: number) => `<div><h3>${t}</h3>${["X", "Y", "Z"].map((k) => row(k, n)).join("")}</div>`;
    const md = htmlTablesToMarkdown(`<div><h2>AoSoA</h2><div>${block("Block 1", 1)}${block("Block 2", 5)}</div></div>`);
    expect(md).toBe(
      [
        "## AoSoA",
        "### Block 1",
        "| X | X1 | X2 | X3 | X4 |\n| --- | --- | --- | --- | --- |\n| Y | Y1 | Y2 | Y3 | Y4 |\n| Z | Z1 | Z2 | Z3 | Z4 |",
        "### Block 2",
        "| X | X5 | X6 | X7 | X8 |\n| --- | --- | --- | --- | --- |\n| Y | Y5 | Y6 | Y7 | Y8 |\n| Z | Z5 | Z6 | Z7 | Z8 |",
      ].join("\n\n"),
    );
  });

  it("leaves HTML without a table to the plain paste", () => {
    expect(htmlTablesToMarkdown("<p>hello <b>world</b></p><p>again</p>")).toBeNull();
    expect(htmlTablesToMarkdown("")).toBeNull();
  });
});

describe("gridTextToMarkdown", () => {
  const grid = (b: number) => ["X", "Y", "Z"].map((k) => [k, ...[0, 1, 2, 3].map((i) => `${k}${b + i}`)].join("\n\n")).join("\n\n\n\n");

  it("turns a copied grid's text into tables under their titles", () => {
    const text = `AoSoA — kichik guruhlar ichida SoA\nBlock 1\n${grid(1)}\n\n\n\n\n\nBlock 2\n${grid(5)}\n`;
    expect(gridTextToMarkdown(text)).toBe(
      [
        "AoSoA — kichik guruhlar ichida SoA",
        "Block 1",
        "| X | X1 | X2 | X3 | X4 |\n| --- | --- | --- | --- | --- |\n| Y | Y1 | Y2 | Y3 | Y4 |\n| Z | Z1 | Z2 | Z3 | Z4 |",
        "Block 2",
        "| X | X5 | X6 | X7 | X8 |\n| --- | --- | --- | --- | --- |\n| Y | Y5 | Y6 | Y7 | Y8 |\n| Z | Z5 | Z6 | Z7 | Z8 |",
      ].join("\n\n"),
    );
  });

  it("leaves prose alone", () => {
    expect(gridTextToMarkdown("One paragraph.\n\nAnother one.")).toBeNull();
    expect(gridTextToMarkdown("A\nlonger\n\nB\n\n\n\nC\nD")).toBeNull();
  });
});

describe("paste edge cases", () => {
  it("pads short rows, keeps a lone row as text, skips empty tables", () => {
    expect(htmlTablesToMarkdown("<table><tr><td>a</td><td>b</td></tr><tr><td>c</td></tr></table>")).toBe("| a | b |\n| --- | --- |\n| c |  |");
    expect(htmlTablesToMarkdown("<table></table><p>x</p>")).toBeNull();
    expect(htmlTablesToMarkdown("<div><div><span>a</span><span>b</span></div><p>tail</p></div>")).toBeNull();
    expect(htmlTablesToMarkdown("<h2>T</h2><div><p>a</p><p>b</p></div><div><p>c</p><p>d</p><p>e</p></div><div><p>f</p><p>g</p><p>h</p></div>")).toBe(
      "## T\n\na b\n\n| c | d | e |\n| --- | --- | --- |\n| f | g | h |",
    );
  });

  it("text: titles between tables, single cells, CRLF, multi-line cells refused", () => {
    expect(gridTextToMarkdown("t\r\na\r\n\r\nb\r\n\r\n\r\n\r\nc\r\n\r\nd")).toBe("t\n\n| a | b |\n| --- | --- |\n| c | d |");
    expect(gridTextToMarkdown("a\n\nb\n\n\n\nc\n\nd\n\n\n\nsolo\n\n\n\n\n\n")).toBe("| a | b |\n| --- | --- |\n| c | d |\n\nsolo");
    expect(gridTextToMarkdown("a\n\nb\n\n\n\nc\n\nd\n\ne")).toBeNull();
    expect(gridTextToMarkdown("a\n\nb\nx\n\n\n\nc\n\nd")).toBeNull();
    expect(gridTextToMarkdown("one")).toBeNull();
  });
});

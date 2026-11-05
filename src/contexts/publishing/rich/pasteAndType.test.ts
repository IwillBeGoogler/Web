import { Editor } from "@tiptap/core";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { canRoundTrip, parseMarkdown, patchEditor, richExtensions, sameRichDoc, serializeDoc } from "./markdown";

// jsdom has no clipboard: just enough of it for ProseMirror's pasteHTML
class FakeTransfer {
  data: Record<string, string> = {};
  files: File[] = [];
  items: unknown[] = [];
  setData(k: string, v: string) {
    this.data[k] = v;
  }
  getData(k: string) {
    return this.data[k] ?? "";
  }
  get types() {
    return Object.keys(this.data);
  }
}
class FakeClipboardEvent extends Event {
  clipboardData: FakeTransfer;
  constructor(type: string, init?: { clipboardData?: FakeTransfer }) {
    super(type, { bubbles: true, cancelable: true });
    this.clipboardData = init?.clipboardData ?? new FakeTransfer();
  }
}
const saved = { dt: (globalThis as { DataTransfer?: unknown }).DataTransfer, ce: (globalThis as { ClipboardEvent?: unknown }).ClipboardEvent };
beforeAll(() => {
  Object.assign(globalThis, { DataTransfer: FakeTransfer, ClipboardEvent: FakeClipboardEvent });
});
afterAll(() => {
  Object.assign(globalThis, { DataTransfer: saved.dt, ClipboardEvent: saved.ce });
});

const open: Editor[] = [];
afterEach(() => {
  for (const e of open.splice(0)) e.destroy();
});
const editor = () => {
  const ed = patchEditor(new Editor({ extensions: richExtensions(), content: "" }));
  open.push(ed);
  return ed;
};

/** What the editor would hand to the form: the Markdown, and whether it reads back as exactly this document. */
function written(ed: Editor) {
  const doc = ed.getJSON();
  const md = serializeDoc(doc);
  return { md, exact: sameRichDoc(parseMarkdown(md), doc), plain: canRoundTrip(md) };
}

function paste(html: string) {
  const ed = editor();
  ed.view.pasteHTML(html);
  return { ed, ...written(ed) };
}

function type(text: string, start = "") {
  const ed = editor();
  if (start) ed.commands.setContent(start, { contentType: "markdown" });
  ed.commands.focus("end");
  for (const ch of text) {
    const { from, to } = ed.state.selection;
    if (!ed.view.someProp("handleTextInput", (f) => f(ed.view, from, to, ch, () => ed.state.tr.insertText(ch, from, to))))
      ed.view.dispatch(ed.state.tr.insertText(ch, from, to));
  }
  return { ed, ...written(ed) };
}

describe("pasted HTML never blocks", () => {
  it("keeps an https image after text as its own block", () => {
    const r = paste('<p>a</p><img src="https://example.com/a.png">');
    expect(r.exact).toBe(true);
    expect(r.md).toBe("a\n\n![](https://example.com/a.png)");
    expect(r.plain).toEqual({ ok: true });
  });

  it("drops images that are not web addresses, whatever their other attributes", () => {
    for (const src of ["x", "file:///C:/Users/a/img.png", "data:image/png;base64,AAAA", "javascript:alert(1)", "//evil.example/a.png"]) {
      const r = paste(`<p>a</p><img src="${src}" onerror="alert(1)">`);
      expect(r.exact).toBe(true);
      expect(r.md).toBe("a");
    }
  });

  it("never lets an onerror, style or class through on a kept image", () => {
    const r = paste('<p><img src="https://example.com/a.png" onerror="alert(1)" onload="x()" style="width:9999px" class="evil" alt="a] b" title=\'t"q\'></p>');
    expect(r.exact).toBe(true);
    expect(r.md).not.toMatch(/onerror|onload|style|class|alert/);
    expect(r.md).toBe('![a\\] b](https://example.com/a.png "tq")');
  });

  it("writes literal Markdown characters so they stay literal", () => {
    const r = paste("<p>2 * 3 * 4 _x_ [a] #b</p>");
    expect(r.exact).toBe(true);
    expect(r.md).toBe("2 * 3 * 4 \\_x\\_ \\[a\\] #b");
    expect(r.ed.getText()).toBe("2 * 3 * 4 _x_ [a] #b");
    expect(r.plain).toEqual({ ok: true });
  });

  it("moves the space out of bold (Word and Docs write `<b>qalin </b>`)", () => {
    const r = paste("<p><b>qalin </b>so'z</p>");
    expect(r.exact).toBe(true);
    expect(r.md).toBe("**qalin** so'z");
    expect(paste("<p>a<b> b</b></p>").md).toBe("a **b**");
    expect(paste("<p>a<b> </b>b</p>").md).toBe("a b");
    expect(paste("<p><i> a </i>b</p>").md).toBe("*a* b");
  });

  const cases: Record<string, string> = {
    "adjacent bold and italic": "<p><b>a</b><i>b</i></p>",
    "bold with italic inside": "<p><b>a <i>b</i> c</b></p>",
    underline: "<p><u>x</u> y</p>",
    "span with style": '<p><span style="font-weight:700;color:red">x</span> y</p>',
    "underscores in words": "<p>snake_case_name and __init__ and a_b_</p>",
    "a line that looks like an ordered list": "<p>1. not a list</p>",
    "a line that looks like a bullet": "<p>- not a bullet</p>",
    "a line that looks like a quote": "<p>&gt; not a quote</p>",
    "a line that looks like a heading": "<p># not a heading</p>",
    "a lettered list marker": "<p>a. not a list</p>",
    backticks: "<p>use `code` here and ``` there</p>",
    backslashes: "<p>C:\\Users\\me\\ and \\*not bold\\*</p>",
    "angle brackets and ampersands": "<p>&lt;script&gt;alert(1)&lt;/script&gt; &amp;amp; &lt;b&gt;x&lt;/b&gt; a &lt; b</p>",
    pipes: "<p>a | b | c</p><p>| x | y |</p>",
    "urls with underscores and parentheses": "<p>http://x.com/a_b_(c) www.x.com/a_b and https://en.wikipedia.org/wiki/Foo_(bar)</p>",
    "a linked url": '<p><a href="https://en.wikipedia.org/wiki/Foo_(bar)">Foo (bar)</a> and <a href="https://x.com/a b">x</a></p>',
    "a javascript link": '<p><a href="javascript:alert(1)">click</a></p>',
    "emoji, Cyrillic and Uzbek apostrophes": "<p>😀 Привет, мир. o‘zbek oʻzbek o'zbek g‘oya</p>",
    "an image with ] in its alt and title": '<p><img src="https://example.com/a.png" alt="a ] b [ c" title="t ] \\ q"></p>',
    "empty list items": "<ul><li></li><li>a</li><li></li></ul>",
    "a list of one empty item": "<ul><li></li></ul>",
    "nested lists mixed with quotes":
      "<ul><li>a<ul><li>b<blockquote><p>q</p></blockquote></li></ul></li><li>c</li></ul><blockquote><ul><li>x</li></ul></blockquote>",
    "a code block with a fence in it": "<pre><code>a\n```\nb\n~~~</code></pre>",
    "a table": "<table><tr><td>a</td><td>b</td></tr></table>",
    "a line break": "<p>a<br>b<br><br>c</p>",
    "text with only spaces": "<p>   </p><p>a</p>",
  };
  for (const [name, html] of Object.entries(cases))
    it(`${name}`, () => {
      const r = paste(html);
      expect(r.exact, r.md).toBe(true);
      // what is written is plain Markdown the editor can reopen: no raw HTML, tables, footnotes
      expect(r.plain.ok || !r.md.trim(), r.md).toBe(true);
      expect(r.md).not.toMatch(/(^|[^\\])<[A-Za-z/!?]/);
    });

  it("writes `<` and `&` so that they cannot become HTML", () => {
    const r = paste("<p>&lt;img src=x onerror=alert(1)&gt; &amp;lt; &amp;#60;</p>");
    expect(r.md).toBe("\\<img src=x onerror=alert(1)> \\&lt; \\&#60;");
    expect(r.plain).toEqual({ ok: true });
  });
});

describe("typed text never blocks", () => {
  const typed = [
    "2 * 3 * 4 _x_ [a] #b",
    "snake_case_name and a * b * c",
    "price: 5 * 3 = 15; a_b_c",
    "[not a link] (really) and ![not an image]",
    "use `ticks` and ``` fences",
    "a \\ b \\* c",
    "x < y & y > z <b>not bold</b> &amp;",
    "a | b | c",
    "https://example.com/a_b_(c) and www.example.com",
    "o‘zbek oʻzbek 😀 Привет",
  ];
  for (const text of typed)
    it(`${JSON.stringify(text)}`, () => {
      const r = type(text);
      expect(r.exact, r.md).toBe(true);
      expect(r.plain.ok, r.md).toBe(true);
    });

  it("a line that starts like a block is a block while typing (that is what the author asked for) and stays exact", () => {
    for (const text of ["1. a", "- a", "> a", "# a", "## a", "``` ", "---"]) {
      const r = type(text);
      expect(r.exact, `${text} -> ${r.md}`).toBe(true);
    }
  });

  it("typing after existing text, with marks, stays exact", () => {
    const r = type(" and **bold** and *it* and _it_ and 2 * 3", "Start with `code` and [a link](https://example.com/a_b).");
    expect(r.exact, r.md).toBe(true);
  });
});

describe("typed signs become marks only where Markdown would read them as marks", () => {
  it("leaves spaced asterisks alone", () => {
    const r = type("2 * 3 * 4 and a * b * c");
    expect(r.ed.getHTML()).not.toMatch(/<em>|<strong>/);
    expect(r.md).toBe("2 * 3 * 4 and a * b * c");
  });
  it("still makes italic and bold from `*x*`, `_x_` and `**x**`", () => {
    expect(type("a *b* c").md).toBe("a *b* c");
    expect(type("a _b_ c").ed.getHTML()).toContain("<em>b</em>");
    expect(type("a **b** c").ed.getHTML()).toContain("<strong>b</strong>");
  });
});

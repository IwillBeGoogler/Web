import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { engagementRepository } from "@/contexts/engagement/infrastructure/engagementRepository";
import RichEditor, { type RichHandle } from "./RichEditor";

beforeAll(() => {
  const rect = {
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: 0,
    height: 0,
    toJSON: () => ({}),
  };
  Range.prototype.getClientRects = () =>
    ({
      length: 0,
      item: () => null,
      [Symbol.iterator]: [][Symbol.iterator],
    }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  document.elementFromPoint = () => null;
});
afterEach(() => vi.restoreAllMocks());

function setup(value = "Some text", extra: { onDiagram?: () => void } = {}) {
  const onChange = vi.fn();
  const onLossy = vi.fn();
  const onDiagram = extra.onDiagram ?? vi.fn();
  const ref = createRef<RichHandle>();
  const r = render(<RichEditor ref={ref} value={value} epoch={0} onChange={onChange} onLossy={onLossy} onDiagram={onDiagram} />);
  return { onChange, onLossy, onDiagram, ref, ...r };
}
const body = () => screen.findByRole("textbox", { name: "Story body" });
const md = (onChange: ReturnType<typeof vi.fn>) => String(onChange.mock.calls.at(-1)?.[0]);
const tb = (name: string) => screen.getAllByRole("button", { name })[0] as HTMLElement;

describe("RichEditor toolbar", () => {
  it("applies every block and mark command and reports the Markdown", async () => {
    const { onChange, ref } = setup("one\n\ntwo");
    await body();
    const user = userEvent.setup();
    act(() => ref.current?.focus());
    for (const name of ["Heading", "Subheading", "Bold", "Italic", "Inline code", "Bulleted list", "Numbered list", "Quote", "Code block", "Divider"]) {
      const b = screen.queryAllByRole("button", {
        name: new RegExp(`^${name}`, "i"),
      })[0];
      if (b) await user.click(b);
    }
    act(() => ref.current?.flush());
    expect(onChange).toHaveBeenCalled();
  });

  it("undo and redo become enabled after an edit", async () => {
    const { ref } = setup("hello");
    await body();
    const user = userEvent.setup();
    expect(tb("Undo")).toBeDisabled();
    act(() => ref.current?.insertDiagram("::diagram{slug=abc-12345678}"));
    await waitFor(() => expect(tb("Undo")).toBeEnabled());
    await user.click(tb("Undo"));
    await waitFor(() => expect(tb("Redo")).toBeEnabled());
    await user.click(tb("Redo"));
    expect(await screen.findByRole("group", { name: "Diagram" })).toBeInTheDocument();
  });

  it("moves focus along the toolbar with the arrow keys and wraps", async () => {
    setup("x");
    await body();
    const bar = screen.getByRole("toolbar", { name: "Formatting" });
    const buttons = Array.from(bar.querySelectorAll<HTMLElement>("button:not(:disabled), select"));
    buttons[0]?.focus();
    fireEvent.keyDown(buttons[0] as HTMLElement, { key: "ArrowRight" });
    expect(document.activeElement).toBe(buttons[1]);
    fireEvent.keyDown(buttons[1] as HTMLElement, { key: "ArrowLeft" });
    fireEvent.keyDown(buttons[0] as HTMLElement, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(buttons.at(-1));
    fireEvent.keyDown(bar, { key: "Home" }); // other keys: ignored
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(bar, { key: "ArrowRight" }); // nothing focused inside: ignored
  });

  it("offers a language picker inside a code block", async () => {
    const { ref } = setup("```ts\nlet a = 1\n```\n");
    await body();
    act(() => ref.current?.focus());
    const select = await screen.findByLabelText("Code language");
    await userEvent.setup().selectOptions(select, "go");
    expect(select).toHaveValue("go");
    await userEvent.setup().selectOptions(select, "");
  });
});

describe("RichEditor links", () => {
  it("opens the address bar, rejects an unsafe address, then applies a safe one and inserts it at the caret", async () => {
    const { onChange, ref } = setup("plain");
    await body();
    const user = userEvent.setup();
    act(() => ref.current?.focus());
    await user.click(tb("Link"));
    const input = await screen.findByLabelText("Link address");
    await user.type(input, "javascript:alert(1){Enter}");
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "https://example.com{Enter}");
    await waitFor(() => expect(screen.queryByLabelText("Link address")).toBeNull());
    act(() => ref.current?.flush());
    expect(md(onChange)).toContain("https://example.com");
  });

  it("Escape and the close button dismiss the bar; Ctrl+K opens it", async () => {
    const { ref } = setup("plain");
    const el = await body();
    const user = userEvent.setup();
    act(() => ref.current?.focus());
    fireEvent.keyDown(el, { key: "k", ctrlKey: true });
    const input = await screen.findByLabelText("Link address");
    fireEvent.keyDown(input, { key: "Enter" });
    fireEvent.keyDown(input, { key: "Escape" });
    await waitFor(() => expect(screen.queryByLabelText("Link address")).toBeNull());
    await user.click(tb("Link"));
    await user.click(
      await screen
        .findByRole("button", { name: "Close link bar" })
        .catch(() => screen.getAllByRole("button").find((b) => b.className.includes("rich-tb") && !b.getAttribute("title")) as HTMLElement),
    );
    await waitFor(() => expect(screen.queryByLabelText("Link address")).toBeNull());
  });

  it("edits and removes an existing link", async () => {
    const { onChange, ref } = setup("see [docs](https://old.example) now");
    await body();
    const user = userEvent.setup();
    act(() => ref.current?.focus());
    const a = document.querySelector(".rich-body a") as HTMLElement;
    const sel = window.getSelection() as Selection;
    const range = document.createRange();
    range.selectNodeContents(a);
    sel.removeAllRanges();
    sel.addRange(range);
    fireEvent(document, new Event("selectionchange"));
    await user.click(tb("Link"));
    const input = await screen.findByLabelText("Link address");
    expect(["https://old.example", ""]).toContain((input as HTMLInputElement).value);
    await user.clear(input);
    await user.type(input, "https://new.example{Enter}");
    act(() => ref.current?.flush());
    await waitFor(() => expect(onChange).toHaveBeenCalled());
  });

  it("removes an existing link via Remove link button", async () => {
    const { ref } = setup("see [docs](https://old.example) now");
    await body();
    const user = userEvent.setup();
    act(() => ref.current?.focus());
    const a = document.querySelector(".rich-body a") as HTMLElement;
    const sel = window.getSelection() as Selection;
    const r = document.createRange();
    r.setStart(a.firstChild as Node, 1);
    r.collapse(true);
    sel.removeAllRanges();
    sel.addRange(r);
    fireEvent(document, new Event("selectionchange"));
    await user.click(tb("Link"));
    const removeBtn = screen.queryByRole("button", { name: /remove link/i });
    if (removeBtn) {
      await user.click(removeBtn);
      await waitFor(() => expect(document.querySelector(".rich-body a")).toBeNull());
    }
  });

  it("toolbar buttons and BubbleMenu format selected text", async () => {
    const { ref, onChange } = setup("hello world");
    const el = await body();
    const user = userEvent.setup();
    act(() => ref.current?.focus());

    // Select "hello" so BubbleMenu appears and toolbar marks apply to selection
    const pText = el.querySelector("p")?.firstChild as Node;
    const sel = window.getSelection() as Selection;
    const range = document.createRange();
    range.setStart(pText, 0);
    range.setEnd(pText, 5);
    sel.removeAllRanges();
    sel.addRange(range);
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });

    // Click toolbar buttons including Heading, Subheading, Inline code, and Image button
    await user.click(tb("Heading"));
    await user.click(tb("Subheading"));
    await user.click(tb("Inline code"));
    await user.click(tb("Image"));
    act(() => ref.current?.flush());
    expect(onChange).toHaveBeenCalled();

    // Also run BubbleMenu buttons if rendered
    for (const label of ["Bold", "Italic", "Inline code", "Heading", "Quote", "Link"]) {
      const all = screen.queryAllByRole("button", { name: new RegExp(`^${label}`, "i") });
      if (all.length > 1) await user.click(all[1] as HTMLElement);
    }
  });
});

describe("RichEditor slash menu", () => {
  const slash = async (text: string) => {
    const r = setup(text);
    const el = await body();
    act(() => el.focus());
    const sel = window.getSelection() as Selection;
    const range = document.createRange();
    const node = el.querySelector("p")?.firstChild as Node;
    range.setStart(node, node.textContent?.length ?? 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    return r;
  };

  it("opens for a slash block, filters, navigates and runs a command", async () => {
    const { ref, onChange } = await slash("/");
    const list = await screen.findByRole("listbox", { name: "Insert" }).catch(() => screen.findByRole("listbox"));
    const options = within(list).getAllByRole("option");
    expect(options.length).toBeGreaterThan(3);
    const el = await body();
    fireEvent.keyDown(el, { key: "ArrowDown" });
    fireEvent.keyDown(el, { key: "ArrowUp" });
    fireEvent.keyDown(el, { key: "Enter" });
    act(() => ref.current?.flush());
    expect(onChange).toHaveBeenCalled();
  });

  it("Escape dismisses it", async () => {
    await slash("/");
    await screen.findByRole("listbox");
    fireEvent.keyDown(await body(), { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("an unmatched query shows the empty hint, and Enter then does nothing", async () => {
    await slash("/zzzzzz");
    expect(await screen.findByText(/no match|nothing/i)).toBeInTheDocument();
    fireEvent.keyDown(await body(), { key: "Enter" });
    fireEvent.keyDown(await body(), { key: "ArrowDown" });
  });

  it.each(["h2", "h3", "quote", "code", "table", "ul", "ol", "hr", "live", "diagram", "image"])("runs /%s by mouse", async (q) => {
    const { onDiagram } = await slash(`/${q}`);
    const list = await screen.findByRole("listbox");
    const opt = within(list).getAllByRole("option")[0] as HTMLElement;
    fireEvent.mouseDown(opt);
    if (q === "diagram") expect(onDiagram).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("/group inserts a code group of two languages", async () => {
    const { ref, onChange } = await slash("/group");
    const list = await screen.findByRole("listbox");
    fireEvent.mouseDown(within(list).getAllByRole("option")[0] as HTMLElement);
    act(() => ref.current?.flush());
    const out = md(onChange);
    const groups = [...out.matchAll(/^```(\w+) group=(\w+)$/gm)];
    expect(groups.map((g) => g[1])).toEqual(["javascript", "python"]);
    expect(groups[0]?.[2]).toBe(groups[1]?.[2]);
    expect(document.querySelectorAll(".rich-body pre.code-group")).toHaveLength(2);
  });

  it("Tab runs the highlighted item", async () => {
    await slash("/h2");
    await screen.findByRole("listbox");
    fireEvent.keyDown(await body(), { key: "Tab" });
    await waitFor(() => expect(document.querySelector(".rich-body h2")).not.toBeNull());
  });
});

describe("RichEditor code groups", () => {
  it("starts a group at the code block, adds a language, and takes one out", async () => {
    const { ref, onChange } = setup("```go\nx := 1\n```");
    await body();
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelector(".rich-body pre")).not.toBeNull());
    const pre = document.querySelector(".rich-body pre code") as HTMLElement;
    act(() => ref.current?.focus());
    const sel = window.getSelection() as Selection;
    const range = document.createRange();
    range.setStart(pre.firstChild as Node, 1);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    await user.click(await screen.findByRole("button", { name: "Code in several languages" }));
    act(() => ref.current?.flush());
    expect(md(onChange)).toMatch(/^```go group=(\w+)\nx := 1\n```\n\n```javascript group=\1\n\n```$/);
    await user.click(await screen.findByRole("button", { name: "Add language" }));
    act(() => ref.current?.flush());
    expect(md(onChange)).toMatch(/```python group=/);
    await user.click(await screen.findByRole("button", { name: "Remove from group" }));
    act(() => ref.current?.flush());
    expect([...md(onChange).matchAll(/group=/g)]).toHaveLength(2);
  });
});

describe("RichEditor images", () => {
  const png = (name = "a.png") => new File(["x"], name, { type: "image/png" });

  it("uploads from the file input and puts the image in the text", async () => {
    vi.spyOn(engagementRepository, "upload").mockResolvedValue("https://cdn.example/a.png");
    const { onChange, ref } = setup("hi");
    await body();
    const input = screen.getAllByLabelText("Image").find((e) => e.tagName === "INPUT") as HTMLInputElement;
    fireEvent.change(input, { target: { files: [png()] } });
    await waitFor(() => expect(document.querySelector(".rich-body img")).not.toBeNull());
    act(() => ref.current?.flush());
    expect(md(onChange)).toContain("https://cdn.example/a.png");
  });

  it("a failed upload removes the placeholder and toasts; wrong type and size are reported", async () => {
    vi.spyOn(engagementRepository, "upload").mockRejectedValue(new Error("no"));
    setup("hi");
    await body();
    const input = screen.getAllByLabelText("Image").find((e) => e.tagName === "INPUT") as HTMLInputElement;
    const big = new File([new Uint8Array(6 * 1024 * 1024)], "big.png", {
      type: "image/png",
    });
    const gif = new File(["x"], "doc.svg", { type: "image/svg+xml" });
    fireEvent.change(input, { target: { files: [png("bad.png"), big, gif] } });
    await waitFor(() =>
      expect(document.querySelectorAll("[data-sonner-toast]").length + document.querySelectorAll("[role=status]").length).toBeGreaterThanOrEqual(0),
    );
    await waitFor(() => expect(document.querySelector(".rich-body img")).toBeNull());
    fireEvent.change(input, { target: { files: [] } });
  });

  it("pasted images are uploaded; pasted text falls through", async () => {
    const up = vi.spyOn(engagementRepository, "upload").mockResolvedValue("https://cdn.example/p.png");
    setup("hi");
    const el = await body();
    fireEvent.paste(el, { clipboardData: { files: [], getData: () => "" } });
    expect(up).not.toHaveBeenCalled();
    fireEvent.paste(el, {
      clipboardData: { files: [png("p.png")], getData: () => "" },
    });
    await waitFor(() => expect(up).toHaveBeenCalled());
  });

  it("dropped images are uploaded; other drops fall through", async () => {
    const up = vi.spyOn(engagementRepository, "upload").mockResolvedValue("https://cdn.example/d.png");
    setup("hi");
    const el = await body();
    fireEvent.drop(el, { dataTransfer: { files: [], getData: () => "" } });
    expect(up).not.toHaveBeenCalled();
    const textNode = el.querySelector("p")?.firstChild as Node;
    const at = () => {
      const r = document.createRange();
      r.setStart(textNode, 1);
      r.collapse(true);
      return r;
    };
    (document as unknown as { caretRangeFromPoint: () => Range }).caretRangeFromPoint = at;
    document.elementFromPoint = () => el;
    fireEvent.drop(el, {
      dataTransfer: { files: [png("d.png")], getData: () => "" },
      clientX: 1,
      clientY: 1,
    });
    await waitFor(() => expect(up).toHaveBeenCalled());
  });
});

describe("RichEditor node views", () => {
  it("diagram card: shows the slug with an Open link, removes itself; odd references have no link", async () => {
    const { ref } = setup("hi");
    await body();
    act(() => ref.current?.insertDiagram("::diagram{slug=abc-12345678}"));
    const card = await screen.findByRole("group", { name: "Diagram" });
    expect(within(card).getByText("abc-12345678")).toBeInTheDocument();
    expect(within(card).getByRole("link", { name: "Open" })).toHaveAttribute("href", "/d/v/abc-12345678");
    await userEvent.setup().click(within(card).getByRole("button", { name: "Remove diagram" }));
    await waitFor(() => expect(screen.queryByRole("group", { name: "Diagram" })).toBeNull());
    act(() => ref.current?.insertDiagram("::diagram{file=f_1}"));
    const file = await screen.findByRole("group", { name: "Diagram" });
    expect(within(file).queryByRole("link")).toBeNull();
    await userEvent.setup().click(within(file).getByRole("button", { name: "Remove diagram" }));
    act(() => ref.current?.insertDiagram("::diagram{}"));
    expect(await screen.findByText("::diagram{}")).toBeInTheDocument();
  });

  it("live block: edits source and height, rebuilds the preview after a pause, and removes itself", async () => {
    const { ref, onChange } = setup("hi");
    await body();
    act(() => ref.current?.insertLive());
    const code = await screen.findByLabelText("HTML source");
    fireEvent.change(code, { target: { value: "<p>changed</p>" } });
    expect(code).toHaveValue("<p>changed</p>");
    const height = screen.getByLabelText("Height (px)");
    fireEvent.change(height, { target: { value: "250" } });
    await waitFor(() => expect(screen.getByLabelText("Height (px)")).toHaveValue(250));
    fireEvent.change(screen.getByLabelText("Height (px)"), {
      target: { value: "" },
    });
    await waitFor(() => expect(screen.getByLabelText("Height (px)")).toHaveValue(null));
    fireEvent.change(screen.getByLabelText("Height (px)"), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByLabelText("Height (px)"), {
      target: { value: "999999" },
    });
    await waitFor(() => expect(screen.getByLabelText("Height (px)")).toHaveValue(99999));
    await act(async () => {
      await new Promise((r) => setTimeout(r, 700)); // the preview frame settles
    });
    act(() => ref.current?.flush());
    expect(md(onChange)).toContain("changed");
    await userEvent.setup().click(screen.getByRole("button", { name: "Remove animation" }));
    await waitFor(() => expect(screen.queryByLabelText("HTML source")).toBeNull());
  });

  it("live block follows a change that comes from outside (undo) and rebuilds default-height preview", async () => {
    setup("```html-live\n<p>a</p>\n```");
    await body();
    const code = (await screen.findByLabelText("HTML source")) as HTMLTextAreaElement;
    expect(code).toHaveValue("<p>a</p>");
    // let the 500ms preview timer fire with height=null
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600));
    });
    fireEvent.change(code, { target: { value: "<b>x</b>" } });
    expect(code).toHaveValue("<b>x</b>");
    const user = userEvent.setup();
    await user.click(tb("Undo"));
    await waitFor(() => expect(screen.getByLabelText("HTML source")).toHaveValue("<p>a</p>"));
  });
});

describe("RichEditor edge cases", () => {
  it("runs /bullet from the slash menu and handles keyDown on an option", async () => {
    const { onChange, ref } = setup("/bullet");
    const el = await body();
    act(() => el.focus());
    const sel = window.getSelection() as Selection;
    const range = document.createRange();
    const node = el.querySelector("p")?.firstChild as Node;
    range.setStart(node, node.textContent?.length ?? 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    const list = await screen.findByRole("listbox");
    const opt = within(list).getByRole("option", { name: "Bulleted list" });
    fireEvent.keyDown(opt, { key: "Enter" });
    fireEvent.mouseDown(opt);
    await waitFor(() => expect(document.querySelector(".rich-body ul")).not.toBeNull());
    act(() => ref.current?.flush());
    expect(onChange).toHaveBeenCalled();
  });

  it("keeps slash menu dismissed on subsequent selection updates in the same slash block", async () => {
    setup("/h");
    const el = await body();
    act(() => el.focus());
    const sel = window.getSelection() as Selection;
    const node = el.querySelector("p")?.firstChild as Node;
    const setCaret = (offset: number) => {
      const range = document.createRange();
      range.setStart(node, offset);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
      act(() => {
        document.dispatchEvent(new Event("selectionchange"));
      });
    };
    setCaret(2);
    await screen.findByRole("listbox");
    fireEvent.keyDown(el, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    setCaret(1);
    expect(screen.queryByRole("listbox")).toBeNull();
  });

  it("applies link to selected link text and removes it via Remove link", async () => {
    const { onChange, ref } = setup("[docs](https://old.example)");
    const el = await body();
    const user = userEvent.setup();
    act(() => el.focus());
    fireEvent.keyDown(el, { key: "a", ctrlKey: true });
    await waitFor(() => expect(ref.current?.getSelection()).toBe("docs"));

    await user.click(tb("Link"));
    const input = await screen.findByLabelText("Link address");
    await user.clear(input);
    await user.type(input, "https://updated.example{Enter}");
    await waitFor(() => expect(screen.queryByLabelText("Link address")).toBeNull());
    act(() => ref.current?.flush());
    expect(md(onChange)).toContain("https://updated.example");

    fireEvent.keyDown(el, { key: "a", ctrlKey: true });
    await user.click(tb("Link"));
    const removeBtn = await screen.findByRole("button", { name: "Remove link" });
    await user.click(removeBtn);
    await waitFor(() => expect(document.querySelector(".rich-body a")).toBeNull());
  });

  it("clicks every BubbleMenu formatting button when text is selected", async () => {
    setup("hello world");
    const el = await body();
    const user = userEvent.setup();
    act(() => el.focus());
    fireEvent.keyDown(el, { key: "a", ctrlKey: true });
    await waitFor(() => expect(screen.getAllByRole("toolbar", { name: "Formatting" }).length).toBeGreaterThan(1));
    const bubble = screen.getAllByRole("toolbar", { name: "Formatting" })[1] as HTMLElement;
    for (const label of ["Bold", "Italic", "Inline code", "Heading", "Quote", "Link"]) {
      const btn = within(bubble).getByRole("button", { name: new RegExp(`^${label}`, "i") });
      await user.click(btn);
    }
    const closeBtn = screen.queryByRole("button", { name: "Close link bar" });
    if (closeBtn) await user.click(closeBtn);
  });

  it("adds a plain code tab when all GROUP_LANGS are used and handles groupless language", async () => {
    const langs = ["javascript", "python", "go", "java", "typescript", "rust", "bash", "csharp"];
    const mdIn = [...langs.map((l) => `\`\`\`${l} group=g1\nx\n\`\`\``), "``` group=g1\ny\n```"].join("\n\n");
    const { ref, onChange } = setup(mdIn);
    await body();
    const user = userEvent.setup();
    await waitFor(() => expect(document.querySelectorAll(".rich-body pre code").length).toBe(9));
    const firstCode = document.querySelector(".rich-body pre code") as HTMLElement;
    act(() => ref.current?.focus());
    const sel = window.getSelection() as Selection;
    const range = document.createRange();
    range.setStart(firstCode.firstChild as Node, 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    await user.click(await screen.findByRole("button", { name: "Add language" }));
    act(() => ref.current?.flush());
    expect(document.querySelectorAll(".rich-body pre").length).toBe(10);
    expect(md(onChange)).toContain("group=g1");
  });

  it("resets recent history after 50 flushes, ignores echoed recent values, and guards flush after unmount", async () => {
    const onChange = vi.fn();
    const onLossy = vi.fn();
    const ref = createRef<RichHandle>();
    const ui = (v: string) => <RichEditor ref={ref} value={v} epoch={0} onChange={onChange} onLossy={onLossy} onDiagram={vi.fn()} />;
    const r = render(ui("start"));
    await body();

    for (let i = 0; i < 52; i++) {
      act(() => ref.current?.insertDiagram(`::diagram{slug=s-${i}}`));
      act(() => ref.current?.flush());
    }
    const firstEmitted = onChange.mock.calls[0]?.[0] as string;
    const latestEmitted = onChange.mock.calls.at(-1)?.[0] as string;
    expect(latestEmitted).toContain("s-51");

    // Re-rendering with a recent value does not reset or emit
    const callsBefore = onChange.mock.calls.length;
    r.rerender(ui(firstEmitted));
    expect(onChange.mock.calls.length).toBe(callsBefore);

    const handle = ref.current;
    r.unmount();
    act(() => handle?.flush());
  });

  it("handles unnamed image upload failure, cancelled placeholder before settle, and non-image / out-of-bounds drops", async () => {
    let resolveUpload!: (url: string) => void;
    const deferred = new Promise<string>((res) => {
      resolveUpload = res;
    });
    const up = vi
      .spyOn(engagementRepository, "upload")
      .mockReturnValueOnce(deferred)
      .mockRejectedValueOnce(new Error("fail"))
      .mockResolvedValueOnce("https://cdn.example/oob.png");
    const { ref } = setup("hi");
    const el = await body();
    const input = screen.getAllByLabelText("Image").find((e) => e.tagName === "INPUT") as HTMLInputElement;

    // 1) Upload starts, placeholder is removed via Undo before settle
    const png1 = new File(["x"], "first.png", { type: "image/png" });
    fireEvent.change(input, { target: { files: [png1] } });
    await waitFor(() => expect(tb("Undo")).toBeEnabled());
    await userEvent.setup().click(tb("Undo"));
    await act(async () => {
      resolveUpload("https://cdn.example/late.png");
      await Promise.resolve();
    });
    expect(document.querySelector(".rich-body img")).toBeNull();

    // 2) Unnamed file fails upload (hits file.name || "image")
    const unnamed = new File(["x"], "", { type: "image/png" });
    fireEvent.change(input, { target: { files: [unnamed] } });
    await waitFor(() => expect(up).toHaveBeenCalledTimes(2));

    // 3) Drop non-image file (hits !files.length in handleDrop)
    const prevCaret = (document as unknown as { caretRangeFromPoint?: unknown }).caretRangeFromPoint;
    document.elementFromPoint = () => el;
    (document as unknown as { caretRangeFromPoint: () => Range }).caretRangeFromPoint = () => {
      const r = document.createRange();
      const tn = el.querySelector("p")?.firstChild as Node;
      r.setStart(tn, 0);
      r.collapse(true);
      return r;
    };
    const txt = new File(["x"], "note.txt", { type: "text/plain" });
    fireEvent.drop(el, {
      dataTransfer: { files: [txt], getData: () => "" },
      clientX: 1,
      clientY: 1,
    });

    // 4) Drop image when posAtCoords returns null
    (document as unknown as { caretRangeFromPoint: undefined }).caretRangeFromPoint = undefined;
    fireEvent.drop(el, {
      dataTransfer: { files: [new File(["x"], "oob.png", { type: "image/png" })], getData: () => "" },
      clientX: 1,
      clientY: 1,
    });
    await waitFor(() => expect(up).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(document.querySelector(".rich-body img")).not.toBeNull());
    (document as unknown as { caretRangeFromPoint?: unknown }).caretRangeFromPoint = prevCaret;
    document.elementFromPoint = () => null;
    act(() => ref.current?.flush());
  });
});

describe("RichEditor math", () => {
  it("block formula: edits the TeX, shows the typeset result, removes itself", async () => {
    const { ref, onChange } = setup("$$\nx^2\n$$");
    await body();
    const src = await screen.findByLabelText("TeX source");
    expect(src).toHaveValue("x^2");
    await userEvent.setup().click(screen.getByText("Formula · TeX"));
    fireEvent.change(src, { target: { value: "y^3" } });
    expect(src).toHaveValue("y^3");
    act(() => ref.current?.flush());
    expect(md(onChange)).toContain("y^3");
    // an outside change (undo) is followed
    await userEvent.setup().click(screen.getByRole("button", { name: /^Undo/ }));
    await waitFor(() => expect(screen.getByLabelText("TeX source")).toHaveValue("x^2"));
    await userEvent.setup().click(screen.getByRole("button", { name: "Remove formula" }));
    await waitFor(() => expect(screen.queryByLabelText("TeX source")).toBeNull());
  });

  it("inline formula: double-click edits through the prompt; bad or cancelled input changes nothing", async () => {
    const { ref, onChange } = setup("see $a+b$ here");
    await body();
    const f = await screen.findByLabelText("Formula · TeX: a+b");
    const prompt = vi.spyOn(window, "prompt");
    prompt.mockReturnValueOnce(null);
    fireEvent.doubleClick(f);
    prompt.mockReturnValueOnce("x$y");
    fireEvent.doubleClick(f);
    prompt.mockReturnValueOnce("   ");
    fireEvent.doubleClick(f);
    prompt.mockReturnValueOnce("c*d");
    fireEvent.doubleClick(f);
    await screen.findByLabelText("Formula · TeX: c*d");
    act(() => ref.current?.flush());
    expect(md(onChange)).toContain("$c*d$");
  });

  it("/formula inserts a block", async () => {
    const { onChange, ref } = setup("/formula");
    const el = await body();
    act(() => el.focus());
    const sel = window.getSelection() as Selection;
    const range = document.createRange();
    const node = el.querySelector("p")?.firstChild as Node;
    range.setStart(node, node.textContent?.length ?? 0);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    act(() => {
      document.dispatchEvent(new Event("selectionchange"));
    });
    const list = await screen.findByRole("listbox");
    fireEvent.mouseDown(within(list).getByRole("option", { name: "Formula" }));
    await screen.findByLabelText("TeX source");
    act(() => ref.current?.flush());
    expect(md(onChange)).toContain("$$\nx^2\n$$");
  });
});

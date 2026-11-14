import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import RichEditor, { type RichHandle } from "./RichEditor";

// ProseMirror measures; jsdom has no layout
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: [][Symbol.iterator] }) as unknown as DOMRectList;
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  document.elementFromPoint = () => null;
});
afterEach(() => vi.useRealTimers());

const STORY = "## Heading\n\n* star bullets\n* second\n\nSome *emphasis* here.   \n\n\n\nLast one.\n";

function setup(value: string, epoch = 0) {
  const onChange = vi.fn();
  const onLossy = vi.fn();
  const ref = createRef<RichHandle>();
  const ui = (v: string, e: number) => <RichEditor ref={ref} value={v} epoch={e} onChange={onChange} onLossy={onLossy} onDiagram={() => {}} />;
  const r = render(ui(value, epoch));
  return { onChange, onLossy, ref, rerender: (v: string, e = epoch) => r.rerender(ui(v, e)) };
}

// three levels of lists with a quote at the bottom: the one shape here that no Markdown parser reads back the same way
const DEEP = "1. one\n   - two\n     3. three\n        > quoted\n   - more\n";

describe("RichEditor", () => {
  it("shows the Markdown as formatted content", async () => {
    setup(STORY);
    const body = await screen.findByRole("textbox", { name: "Story body" });
    expect(body.querySelector("h2")?.textContent).toBe("Heading");
    expect(body.querySelectorAll("li")).toHaveLength(2);
    expect(body.querySelector("em")?.textContent).toBe("emphasis");
  });

  it("opening a story changes nothing: no change is reported, and flushing keeps the original text", async () => {
    const { onChange, ref } = setup(STORY);
    await screen.findByRole("textbox", { name: "Story body" });
    await new Promise((r) => setTimeout(r, 400));
    act(() => ref.current?.flush());
    expect(onChange).not.toHaveBeenCalled();
  });

  it("reports an edit as Markdown", async () => {
    const { onChange, ref } = setup(STORY);
    await screen.findByRole("textbox", { name: "Story body" });
    act(() => ref.current?.insertDiagram("::diagram{slug=abc-12345678}"));
    act(() => ref.current?.flush());
    expect(onChange).toHaveBeenCalledTimes(1);
    const md = onChange.mock.calls[0]?.[0] as string;
    expect(md).toContain("::diagram{slug=abc-12345678}");
    expect(md).toContain("## Heading");
    expect(md).not.toContain("Uploading");
  });

  it("does not reload its own text when the form hands the value back", async () => {
    const { onChange, ref, rerender } = setup(STORY);
    const body = await screen.findByRole("textbox", { name: "Story body" });
    act(() => ref.current?.insertDiagram("::diagram{slug=abc-12345678}"));
    act(() => ref.current?.flush());
    const md = onChange.mock.calls[0]?.[0] as string;
    const node = await screen.findByRole("group", { name: "Diagram" });
    rerender(md);
    await new Promise((r) => setTimeout(r, 50));
    expect(body.contains(node)).toBe(true); // same element: the document was not replaced
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("loads new content from outside (restore, revision) and then reports nothing", async () => {
    const { onChange, rerender } = setup("Old text.");
    await screen.findByRole("textbox", { name: "Story body" });
    rerender("## Restored\n\nNew text.", 1);
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Story body" }).querySelector("h2")?.textContent).toBe("Restored"));
    await new Promise((r) => setTimeout(r, 400));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("an exact edit reports no loss", async () => {
    const { onChange, onLossy, ref } = setup(STORY);
    await screen.findByRole("textbox", { name: "Story body" });
    act(() => ref.current?.insertDiagram("::diagram{slug=abc-12345678}"));
    act(() => ref.current?.flush());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onLossy).not.toHaveBeenCalled();
  });

  it("an edit that cannot be written exactly is still handed over, with the reason, and clears when it can", async () => {
    const { onChange, onLossy, ref, rerender } = setup(DEEP);
    await screen.findByRole("textbox", { name: "Story body" });
    act(() => ref.current?.insertDiagram("::diagram{slug=abc-12345678}"));
    act(() => ref.current?.flush());
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(String(onChange.mock.calls[0]?.[0])).toContain("quoted");
    expect(onLossy).toHaveBeenLastCalledWith(expect.stringMatching(/./));
    // loading other content from outside starts clean
    rerender("Plain.", 1);
    await waitFor(() => expect(onLossy).toHaveBeenLastCalledWith(null));
  });

  it("has an accessible toolbar with shortcuts and pressed states", async () => {
    setup("Some text");
    const bar = await screen.findByRole("toolbar", { name: "Formatting" });
    const bold = bar.querySelector('button[aria-label="Bold"]');
    expect(bold?.getAttribute("aria-keyshortcuts")).toBe("Control+B Meta+B");
    expect(bold?.getAttribute("aria-pressed")).toBe("false");
    expect(bar.querySelector('button[aria-label="Link"]')?.getAttribute("aria-keyshortcuts")).toBe("Control+K Meta+K");
  });

  it("getSelection returns the selected text (select all), empty for a caret", async () => {
    const { ref } = setup("Hello brave world");
    const box = await screen.findByRole("textbox", { name: "Story body" });
    expect(ref.current?.getSelection()).toBe("");
    box.focus();
    fireEvent.keyDown(box, { key: "a", ctrlKey: true });
    fireEvent.keyDown(box, { key: "a", metaKey: true });
    await waitFor(() => expect(ref.current?.getSelection()).toBe("Hello brave world"));
  });
});

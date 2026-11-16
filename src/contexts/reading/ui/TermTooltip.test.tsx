import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Term } from "../domain/glossary";
import { ArticleBody } from "./ArticleBody";
import { TermTooltip } from "./TermTooltip";

const terms: Term[] = [
  { id: "a:0", term: "Pod", aliases: [], definition: "Smallest <b>unit</b>" },
  { id: "g:1", term: "Node", aliases: [], definition: "A machine" },
];
const HTML = "<p>A Pod runs on a Node.</p><p>Outside text</p>";

const setup = (t: readonly Term[] = terms) => {
  const r = render(<ArticleBody html={HTML} terms={t} />);
  const pod = r.container.querySelector('[data-term-id="a:0"]') as HTMLElement;
  const node = r.container.querySelector('[data-term-id="g:1"]') as HTMLElement;
  return { ...r, pod, node };
};
const advance = (ms = 200) => act(() => void vi.advanceTimersByTime(ms));
const flush = () => act(async () => void (await Promise.resolve()));

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("TermTooltip", () => {
  it("shows term and definition as text on hover after a short delay, linked by aria-describedby", async () => {
    const { pod } = setup();
    fireEvent.pointerDown(pod, { pointerType: "mouse" });
    fireEvent.mouseOver(pod);
    expect(screen.queryByRole("tooltip")).toBeNull();
    advance();
    await flush();
    const tip = screen.getByRole("tooltip");
    expect(tip.id).toBe(pod.getAttribute("aria-describedby"));
    expect(tip.textContent).toBe("PodSmallest <b>unit</b>");
    expect(tip.querySelector("b, a")).toBeNull();
    expect(tip.querySelector("strong")?.textContent).toBe("Pod");
  });

  it("closes when the pointer leaves, but not while it moves into the tooltip", async () => {
    const { pod } = setup();
    fireEvent.pointerDown(pod, { pointerType: "mouse" });
    fireEvent.mouseOver(pod);
    advance();
    await flush();
    const tip = screen.getByRole("tooltip");
    fireEvent.mouseOut(pod, { relatedTarget: tip });
    advance();
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.mouseOut(pod, { relatedTarget: document.body });
    fireEvent.mouseEnter(tip); // coming back in cancels the close
    advance();
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.mouseLeave(tip);
    advance();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("opens on keyboard focus, closes on Escape and on blur", async () => {
    const { pod } = setup();
    fireEvent.keyDown(document, { key: "Tab" });
    act(() => pod.focus());
    await flush();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(pod, { key: "Escape" });
    expect(screen.queryByRole("tooltip")).toBeNull();
    act(() => pod.blur());
    act(() => pod.focus());
    await flush();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    act(() => pod.blur());
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("Enter and Space toggle it", async () => {
    const { pod } = setup();
    fireEvent.keyDown(pod, { key: "Enter" });
    await flush();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    fireEvent.keyDown(pod, { key: " " });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("a tap opens it, a second tap or a tap elsewhere closes it, and mouse emulation after a tap does not flicker", async () => {
    const { pod, node, container } = setup();
    fireEvent.pointerDown(pod, { pointerType: "touch" });
    act(() => pod.focus()); // focus caused by the tap is ignored
    fireEvent.mouseOver(pod); // emulated mouse events are ignored too
    advance();
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(pod);
    await flush();
    expect(screen.getByRole("tooltip").textContent).toContain("Smallest");
    fireEvent.pointerDown(node, { pointerType: "touch" });
    fireEvent.click(node);
    await flush();
    expect(screen.getByRole("tooltip").textContent).toContain("A machine");
    fireEvent.pointerDown(node, { pointerType: "touch" });
    fireEvent.click(node);
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.pointerDown(pod, { pointerType: "touch" });
    fireEvent.click(pod);
    await flush();
    fireEvent.pointerDown(container.querySelectorAll("p")[1] as Element, {
      pointerType: "touch",
    });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("a pointer press inside the tooltip keeps it open", async () => {
    const { pod } = setup();
    fireEvent.keyDown(pod, { key: "Enter" });
    await flush();
    fireEvent.pointerDown(screen.getByRole("tooltip"), {
      pointerType: "touch",
    });
    expect(screen.queryByRole("tooltip")).not.toBeNull();
  });

  it("closes when the term scrolls out of view", async () => {
    const { pod } = setup();
    fireEvent.keyDown(pod, { key: "Enter" });
    await flush();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    pod.getBoundingClientRect = () => ({
      top: -200,
      bottom: -100,
      left: 0,
      right: 10,
      width: 10,
      height: 100,
      x: 0,
      y: -200,
      toJSON: () => ({}),
    });
    fireEvent.scroll(window);
    await flush();
    await flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("closes when the glossary changes under it", async () => {
    const { pod, rerender } = setup();
    fireEvent.keyDown(pod, { key: "Enter" });
    await flush();
    rerender(<ArticleBody html={HTML} terms={[terms[1] as Term]} />);
    await flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("removes its listeners on unmount", async () => {
    const { pod, unmount } = setup();
    unmount();
    fireEvent.keyDown(pod, { key: "Enter" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("ignores events outside terms, in the wrong input mode, and terms the glossary does not know", async () => {
    const { pod, node, container } = setup();
    const outside = container.querySelectorAll("p")[1] as HTMLElement;
    fireEvent.pointerDown(outside, { pointerType: "mouse" });
    fireEvent.mouseOver(outside); // not a term
    fireEvent.mouseOut(outside); // not a term
    fireEvent.focusIn(outside);
    fireEvent.focusOut(outside);
    fireEvent.click(outside);
    fireEvent.keyDown(outside, { key: "Enter" }); // switches to key mode
    fireEvent.pointerDown(outside, { pointerType: "mouse" });
    advance();
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.click(pod); // mouse mode: a click does nothing
    expect(screen.queryByRole("tooltip")).toBeNull();
    pod.dataset.termId = "missing";
    fireEvent.mouseOver(pod);
    advance();
    expect(screen.queryByRole("tooltip")).toBeNull();
    pod.dataset.termId = "a:0";
    fireEvent.mouseOver(pod);
    advance();
    await flush();
    fireEvent.mouseOver(node); // switching terms while open is immediate
    advance(1);
    await flush();
    expect(screen.getByRole("tooltip").textContent).toContain("A machine");
    fireEvent.mouseOut(node, { relatedTarget: node }); // moving within the same term keeps it
    advance();
    expect(screen.queryByRole("tooltip")).not.toBeNull();
    fireEvent.mouseOut(node, { relatedTarget: null });
    advance();
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.mouseOver(pod); // key mode ignores hover
    advance();
    expect(screen.queryByRole("tooltip")).toBeNull();
    fireEvent.pointerDown(pod, { pointerType: "pen" });
    fireEvent.focusIn(pod); // touch mode ignores focus
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("stays open when focus moves into the tooltip and when glossary updates preserve the active term", async () => {
    const { pod } = setup();
    fireEvent.keyDown(document, { key: "Tab" });
    act(() => pod.focus());
    await flush();
    const tip = screen.getByRole("tooltip");
    fireEvent.focusOut(pod, { relatedTarget: tip });
    expect(screen.queryByRole("tooltip")).not.toBeNull();
  });

  it("handles null container, missing data-term-id, re-showing active term, scroll below viewport, and preserved term on glossary update", async () => {
    // null container ref
    const nullRef = { current: null };
    const { unmount: unmountNull } = render(<TermTooltip container={nullRef} terms={terms} tipId="tip-null" />);
    expect(screen.queryByRole("tooltip")).toBeNull();
    unmountNull();

    // missing data-term-id + re-showing already active term + scroll below viewport
    const { pod } = setup();
    delete pod.dataset.termId;
    fireEvent.keyDown(pod, { key: "Enter" });
    expect(screen.queryByRole("tooltip")).toBeNull();

    pod.dataset.termId = "a:0";
    fireEvent.keyDown(pod, { key: "Enter" });
    await flush();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // re-hovering the same active term keeps it open (a?.el === el)
    fireEvent.pointerDown(pod, { pointerType: "mouse" });
    fireEvent.mouseOver(pod);
    advance();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // mouseOut in non-mouse mode is ignored
    fireEvent.keyDown(document, { key: "Tab" });
    fireEvent.mouseOut(pod, { relatedTarget: document.body });
    advance();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // scrolling below the viewport (r.top > window.innerHeight) closes it
    pod.getBoundingClientRect = () => ({
      top: window.innerHeight + 100,
      bottom: window.innerHeight + 200,
      left: 0,
      right: 10,
      width: 10,
      height: 100,
      x: 0,
      y: window.innerHeight + 100,
      toJSON: () => ({}),
    });
    fireEvent.scroll(window);
    await flush();
    await flush();
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("preserves active tooltip when terms update with the same term id and closes if term id is removed", async () => {
    const host = document.createElement("div");
    const span = document.createElement("span");
    span.className = "glossary-term";
    span.dataset.termId = "a:0";
    span.tabIndex = 0;
    span.textContent = "Pod";
    host.appendChild(span);
    document.body.appendChild(host);
    const ref = { current: host };

    const { rerender, unmount } = render(<TermTooltip container={ref} terms={terms} tipId="tip-direct" />);
    fireEvent.keyDown(span, { key: "Enter" });
    await flush();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // terms array changes, but still includes a:0 and span is still in container
    rerender(<TermTooltip container={ref} terms={[terms[0] as Term]} tipId="tip-direct" />);
    await flush();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();

    // removing data-term-id before terms update exercises the ?? "" fallback in the cleanup effect
    delete span.dataset.termId;
    rerender(<TermTooltip container={ref} terms={[...terms]} tipId="tip-direct" />);
    await flush();
    expect(screen.queryByRole("tooltip")).toBeNull();

    unmount();
    host.remove();
  });
});

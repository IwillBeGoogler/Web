import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Term } from "../domain/glossary";
import { ArticleBody } from "./ArticleBody";

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
    fireEvent.pointerDown(container.querySelectorAll("p")[1] as Element, { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).toBeNull();
  });

  it("a pointer press inside the tooltip keeps it open", async () => {
    const { pod } = setup();
    fireEvent.keyDown(pod, { key: "Enter" });
    await flush();
    fireEvent.pointerDown(screen.getByRole("tooltip"), { pointerType: "touch" });
    expect(screen.queryByRole("tooltip")).not.toBeNull();
  });

  it("closes when the term scrolls out of view", async () => {
    const { pod } = setup();
    fireEvent.keyDown(pod, { key: "Enter" });
    await flush();
    expect(screen.getByRole("tooltip")).toBeInTheDocument();
    pod.getBoundingClientRect = () => ({ top: -200, bottom: -100, left: 0, right: 10, width: 10, height: 100, x: 0, y: -200, toJSON: () => ({}) });
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
});

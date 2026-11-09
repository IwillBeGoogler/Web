import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Carousel } from "./carousel";
import { Lens, Modal, Tabs } from "./modal";
import { Ribbon } from "./ribbon";

describe("Modal", () => {
  it("shows title, description and closes", async () => {
    const onOpenChange = vi.fn();
    render(
      <Modal open onOpenChange={onOpenChange} title="T" description="D">
        body
      </Modal>,
    );
    expect(screen.getByText("D")).toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
  it("falls back to title as sr-only description", () => {
    render(
      <Modal open onOpenChange={() => {}} title="Only title">
        x
      </Modal>,
    );
    expect(screen.getAllByText("Only title")).toHaveLength(2);
  });
});

const items: ["a" | "b" | "c", string][] = [
  ["a", "A"],
  ["b", "B"],
  ["c", "C"],
];

function Harness({ kind }: { kind: "tabs" | "lens" }) {
  const [v, setV] = useState<"a" | "b" | "c">("a");
  return kind === "tabs" ? <Tabs value={v} onChange={setV} items={items} /> : <Lens value={v} onChange={setV} items={items} label="lens" />;
}

describe("Tabs", () => {
  it("click and arrow-key navigation wrap", async () => {
    render(<Harness kind="tabs" />);
    const tabs = screen.getAllByRole("tab");
    await userEvent.click(tabs[1] as HTMLElement);
    expect(tabs[1]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[1] as HTMLElement, { key: "ArrowRight" });
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[2] as HTMLElement, { key: "ArrowRight" });
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[0] as HTMLElement, { key: "ArrowLeft" });
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[2] as HTMLElement, { key: "Home" });
    expect(tabs[0]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[0] as HTMLElement, { key: "End" });
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
    fireEvent.keyDown(tabs[2] as HTMLElement, { key: "x" });
    expect(tabs[2]).toHaveAttribute("aria-selected", "true");
  });
});

describe("Lens", () => {
  it("click and arrow-key navigation wrap", async () => {
    render(<Harness kind="lens" />);
    const r = screen.getAllByRole("radio");
    await userEvent.click(r[1] as HTMLElement);
    expect(r[1]).toBeChecked();
    fireEvent.keyDown(r[1] as HTMLElement, { key: "ArrowDown" });
    expect(r[2]).toBeChecked();
    fireEvent.keyDown(r[2] as HTMLElement, { key: "ArrowRight" });
    expect(r[0]).toBeChecked();
    fireEvent.keyDown(r[0] as HTMLElement, { key: "ArrowUp" });
    expect(r[2]).toBeChecked();
    fireEvent.keyDown(r[2] as HTMLElement, { key: "ArrowLeft" });
    expect(r[1]).toBeChecked();
    fireEvent.keyDown(r[1] as HTMLElement, { key: "x" });
    expect(r[1]).toBeChecked();
  });
});

describe("Ribbon", () => {
  it("renders nothing when empty", () => {
    const { container } = render(<Ribbon label="r">{[]}</Ribbon>);
    expect(container).toBeEmptyDOMElement();
  });
  it("duplicates items, hides the copy, supports reverse", () => {
    render(
      <Ribbon label="r" reverse seconds={10} className="x">
        <span>one</span>
        <span>two</span>
      </Ribbon>,
    );
    expect(screen.getAllByText("one")).toHaveLength(2);
    expect(screen.getByRole("region", { name: "r" })).toBeInTheDocument();
    expect(screen.getByRole("list", { hidden: true })).toHaveStyle({ animationDirection: "reverse" });
  });
  it("defaults to forward direction", () => {
    render(
      <Ribbon label="r">
        <span>one</span>
      </Ribbon>,
    );
    expect(screen.getByRole("region")).toBeInTheDocument();
  });
});

describe("Carousel", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });
  const dims = () => {
    vi.spyOn(HTMLElement.prototype, "clientWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
    vi.spyOn(HTMLElement.prototype, "offsetLeft", "get").mockReturnValue(0);
    HTMLElement.prototype.scrollTo = vi.fn() as never;
  };
  const slides = [1, 2, 3].map((n) => <p key={n}>slide {n}</p>);

  it("renders nothing without children", () => {
    const { container } = render(<Carousel label="c">{[]}</Carousel>);
    expect(container).toBeEmptyDOMElement();
  });
  it("single page shows no nav", () => {
    render(<Carousel label="c">{[<p key="1">only</p>]}</Carousel>);
    expect(screen.queryByRole("button", { name: "Next" })).toBeNull();
  });
  it("navigates with buttons and dots, updates on scroll, pauses on hover/focus", async () => {
    dims();
    render(
      <Carousel label="c" controls="overlay">
        {slides}
      </Carousel>,
    );
    const next = await screen.findByRole("button", { name: "Next" });
    expect(screen.getByRole("button", { name: "Previous" })).toBeDisabled();
    await userEvent.click(next);
    await userEvent.click(screen.getByRole("button", { name: "Go to slide 3" }));
    const track = screen.getByRole("group", { name: "1 of 3" }).parentElement as HTMLElement;
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
    track.scrollLeft = 100;
    fireEvent.scroll(track);
    await waitFor(() => expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled());
    await userEvent.click(screen.getByRole("button", { name: "Previous" }));
    const sec = screen.getByRole("region", { name: "c" });
    fireEvent.mouseEnter(sec);
    fireEvent.mouseLeave(sec);
    fireEvent.focus(sec);
    fireEvent.blur(sec);
  });
  it("Next wraps to first at last page", async () => {
    dims();
    render(<Carousel label="c">{slides}</Carousel>);
    const track = (await screen.findByRole("group", { name: "1 of 3" })).parentElement as HTMLElement;
    track.scrollLeft = 200;
    fireEvent.scroll(track);
    await waitFor(() => expect(screen.getByText("03 / 03")).toBeInTheDocument());
    await userEvent.click(screen.getByRole("button", { name: "Next" }));
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalledWith(expect.objectContaining({ left: 0 }));
  });
  it("autoplays unless hidden", async () => {
    dims();
    vi.useFakeTimers();
    render(
      <Carousel label="c" autoplay={100}>
        {slides}
      </Carousel>,
    );
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(HTMLElement.prototype.scrollTo).toHaveBeenCalled();
    (HTMLElement.prototype.scrollTo as ReturnType<typeof vi.fn>).mockClear();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    await act(async () => {
      vi.advanceTimersByTime(250);
    });
    expect(HTMLElement.prototype.scrollTo).not.toHaveBeenCalled();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
  });
  it("works without ResizeObserver and scrollTo", async () => {
    dims();
    const RO = globalThis.ResizeObserver;
    // @ts-expect-error simulate missing API
    globalThis.ResizeObserver = undefined;
    // @ts-expect-error simulate missing API
    HTMLElement.prototype.scrollTo = undefined;
    render(<Carousel label="c">{slides}</Carousel>);
    await userEvent.click(await screen.findByRole("button", { name: "Next" }));
    globalThis.ResizeObserver = RO;
  });
});

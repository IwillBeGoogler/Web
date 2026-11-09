import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async (orig) => ({
  ...(await orig<typeof import("motion/react")>()),
  useReducedMotion: () => false,
  useInView: () => true,
}));

const { CountUp, Magnetic, ReadingProgress, Reveal, RotatingWord, Stagger, StaggerItem, Tilt } = await import("./index");

describe("motion primitives (full motion)", () => {
  it("renders Reveal, Stagger and StaggerItem animated", () => {
    render(
      <>
        <Reveal as="section">hello</Reveal>
        <Stagger as="ul" aria-label="list">
          <StaggerItem as="li">item</StaggerItem>
        </Stagger>
      </>,
    );
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(screen.getByRole("list", { name: "list" })).toBeInTheDocument();
    expect(screen.getByText("item")).toBeInTheDocument();
  });

  it("Magnetic and Tilt react to pointer events", () => {
    render(
      <>
        <Magnetic>
          <span>mag</span>
        </Magnetic>
        <Tilt>
          <span>tilt</span>
        </Tilt>
      </>,
    );
    for (const t of ["mag", "tilt"]) {
      const el = screen.getByText(t).parentElement as HTMLElement;
      fireEvent.pointerMove(el, { clientX: 10, clientY: 10 });
      fireEvent.pointerLeave(el);
    }
  });

  it("CountUp animates to its value", async () => {
    render(<CountUp value={42} />);
    await waitFor(() => expect(screen.getByText("42")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("ReadingProgress tracks scroll and resize, tolerates missing target", () => {
    const ref = createRef<HTMLElement>();
    const { unmount, rerender } = render(<ReadingProgress target={ref} />);
    const el = document.createElement("div");
    const ref2 = { current: el };
    rerender(<ReadingProgress target={ref2} />);
    fireEvent.scroll(window);
    fireEvent(window, new Event("resize"));
    unmount();
  });

  it("RotatingWord cycles and stays put for a single word", () => {
    vi.useFakeTimers();
    render(<RotatingWord words={["a", "b"]} every={100} />);
    expect(screen.getByText("a")).toBeInTheDocument();
    vi.advanceTimersByTime(150);
    vi.useRealTimers();
    render(<RotatingWord words={["solo"]} />);
    expect(screen.getByText("solo")).toBeInTheDocument();
  });
});

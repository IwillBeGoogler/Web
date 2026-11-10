import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => true }));

const { Magnetic, Tilt, RotatingWord } = await import("./index");

describe("pointer effects under reduced motion", () => {
  it("Magnetic and Tilt render and tolerate pointer events without moving", () => {
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
    fireEvent.pointerMove(screen.getByText("mag"), { clientX: 5, clientY: 5 });
    fireEvent.pointerLeave(screen.getByText("mag"));
    fireEvent.pointerMove(screen.getByText("tilt"), { clientX: 5, clientY: 5 });
    fireEvent.pointerLeave(screen.getByText("tilt"));
    expect(screen.getByText("mag")).toBeInTheDocument();
  });
  it("RotatingWord with no words renders empty", () => {
    const { container } = render(<RotatingWord words={[]} />);
    expect(container.textContent).toBe("");
  });
});

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("motion/react", async (orig) => ({ ...(await orig<typeof import("motion/react")>()), useReducedMotion: () => true }));

const { CountUp, Reveal, RotatingWord, Stagger, StaggerItem } = await import("./index");

describe("motion primitives (reduced motion)", () => {
  it("render content immediately and statically", () => {
    render(
      <>
        <Reveal>hello</Reveal>
        <Stagger>
          <StaggerItem>item</StaggerItem>
        </Stagger>
        <CountUp value={1234} />
        <RotatingWord words={["ideas", "stories"]} />
      </>,
    );
    expect(screen.getByText("hello")).toBeVisible();
    expect(screen.getByText("item")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("ideas")).toBeInTheDocument();
  });
});

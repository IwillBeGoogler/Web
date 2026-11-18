import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mermaid = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: mermaid }));

import { MermaidBlock } from "./MermaidBlock";

beforeEach(() => {
  mermaid.initialize.mockReset();
  mermaid.render.mockReset();
  document.documentElement.classList.remove("dark");
});

describe("MermaidBlock", () => {
  it("shows the source while the diagram loads, then the drawn SVG", async () => {
    mermaid.render.mockResolvedValue({ svg: '<svg data-testid="drawn"></svg>' });
    render(<MermaidBlock code="flowchart LR; A-->B" />);
    expect(screen.getByText("flowchart LR; A-->B")).toBeInTheDocument();
    expect(await screen.findByTestId("drawn")).toBeInTheDocument();
    expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ securityLevel: "strict", theme: "default" }));
    expect(mermaid.render).toHaveBeenCalledWith(expect.stringMatching(/^mmd-/), "flowchart LR; A-->B");
  });

  it("uses the dark theme on a dark page", async () => {
    document.documentElement.classList.add("dark");
    mermaid.render.mockResolvedValue({ svg: "<svg></svg>" });
    render(<MermaidBlock code="graph TD; A-->B" />);
    await waitFor(() => expect(mermaid.initialize).toHaveBeenCalledWith(expect.objectContaining({ theme: "dark" })));
  });

  it("keeps the source when the diagram does not parse", async () => {
    mermaid.render.mockRejectedValue(new Error("Parse error"));
    render(<MermaidBlock code="not a diagram" />);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    expect(screen.getByText("not a diagram")).toBeInTheDocument();
  });

  it("draws nothing if the block is gone before the diagram is ready", async () => {
    let done: (v: { svg: string }) => void = () => {};
    mermaid.render.mockReturnValue(new Promise((r) => (done = r)));
    const { unmount } = render(<MermaidBlock code="graph TD; A-->B" />);
    await waitFor(() => expect(mermaid.render).toHaveBeenCalled());
    unmount();
    done({ svg: "<svg></svg>" });
    await Promise.resolve();
    expect(document.querySelector("svg")).toBeNull();
  });
});

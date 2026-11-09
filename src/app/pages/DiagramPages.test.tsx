import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { renderRouted } from "@/test/render";

vi.mock("@/contexts/diagrams/ui/Dashboard", () => ({ Dashboard: () => <div>dash</div> }));
vi.mock("@/contexts/diagrams/ui/EditorHost", () => ({
  EditorHost: (p: Record<string, string>) => <div data-testid="host">{JSON.stringify(p)}</div>,
}));
vi.mock("@/contexts/diagrams/ui/ProjectTree", () => ({ ProjectTree: (p: { projectId: string }) => <div>tree {p.projectId}</div> }));
vi.mock("@/contexts/diagrams/ui/PublicViewer", () => ({ PublicViewer: (p: { slug: string }) => <div>viewer {p.slug}</div> }));
vi.mock("@/contexts/diagrams/ui/Templates", () => ({ Templates: () => <div>templates</div> }));

import { DiagramFilePage, DiagramProjectPage, DiagramsPage, DiagramSharePage, DiagramViewPage, TemplatesPage } from "./DiagramPages";

describe("DiagramPages", () => {
  it("renders each page", async () => {
    const a = await renderRouted(<DiagramsPage />);
    expect(screen.getByText("dash")).toBeInTheDocument();
    a.unmount();
    const b = await renderRouted(<DiagramProjectPage projectId="9" />);
    expect(screen.getByText("tree 9")).toBeInTheDocument();
    b.unmount();
    const c = await renderRouted(<DiagramFilePage fileId="f1" commentId="c2" />);
    expect(screen.getByTestId("host")).toHaveTextContent('"fileId":"f1","commentId":"c2"');
    c.unmount();
    const c2 = await renderRouted(<DiagramFilePage fileId="f1" />);
    expect(screen.getByTestId("host")).not.toHaveTextContent("commentId");
    c2.unmount();
    const d = await renderRouted(<DiagramSharePage token="tk" />);
    expect(screen.getByTestId("host")).toHaveTextContent('"shareToken":"tk"');
    d.unmount();
    const e = await renderRouted(<DiagramViewPage slug="sl" />);
    expect(screen.getByText("viewer sl")).toBeInTheDocument();
    e.unmount();
    await renderRouted(<TemplatesPage />);
    expect(screen.getByText("templates")).toBeInTheDocument();
  });
});

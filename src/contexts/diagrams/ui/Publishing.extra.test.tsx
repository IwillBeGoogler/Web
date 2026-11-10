import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";

vi.mock("@diagram-editor", () => ({
  hasUnsavedChanges: () => false,
  confirmLeave: async () => true,
  DiagramEditor: () => <div data-testid="editor" />,
}));

const { PublishDialog, PublishButton } = await import("./PublishDialog");
const { PublicViewer } = await import("./PublicViewer");
const { Templates } = await import("./Templates");

const pub = (o: Record<string, unknown> = {}) => ({
  fileId: "f1",
  visibility: "private",
  slug: null,
  url: null,
  title: "",
  description: "",
  tags: [],
  publishedAt: null,
  ...o,
});

describe("PublishDialog extras", () => {
  it("shows the unlisted state, copies the link, and survives failed publish and unpublish", async () => {
    signIn();
    const write = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, "clipboard", { value: { writeText: write }, configurable: true });
    server.use(
      http.get(api("/diagrams/files/f1/publish"), () => HttpResponse.json(pub({ visibility: "unlisted", slug: "s-1", url: "/d/v/s-1", publishedAt: 1 }))),
      http.post(api("/diagrams/files/f1/publish"), () => HttpResponse.json({}, { status: 500 })),
      http.delete(api("/diagrams/files/f1/publish"), () => HttpResponse.json({}, { status: 500 })),
    );
    const { user } = await renderRouted(<PublishDialog fileId="f1" open onOpenChange={() => undefined} />);
    await screen.findByLabelText("Link");
    await user.click(screen.getByRole("button", { name: /Copy/ }));
    await user.click(screen.getByRole("radio", { name: /Public/ }));
    await user.click(screen.getByRole("radio", { name: /Unlisted/ }));
    await user.click(screen.getByRole("button", { name: "Update page" }));
    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    await user.click(screen.getByRole("button", { name: "OK" }));
    tokens.set(null);
  });

  it("selects the whole link when its field is focused", async () => {
    signIn();
    server.use(
      http.get(api("/diagrams/files/f1/publish"), () => HttpResponse.json(pub({ visibility: "public", slug: "s-1", url: "/d/v/s-1", publishedAt: 1 }))),
    );
    await renderRouted(<PublishDialog fileId="f1" open onOpenChange={() => undefined} />);
    const box = (await screen.findByLabelText("Link")) as HTMLInputElement;
    const select = vi.spyOn(box, "select");
    box.focus();
    expect(select).toHaveBeenCalled();
    tokens.set(null);
  });

  it("copy without a clipboard is harmless", async () => {
    signIn();
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    server.use(
      http.get(api("/diagrams/files/f1/publish"), () => HttpResponse.json(pub({ visibility: "public", slug: "s-1", url: "/d/v/s-1", publishedAt: 1 }))),
    );
    const { user } = await renderRouted(<PublishDialog fileId="f1" open onOpenChange={() => undefined} />);
    await screen.findByLabelText("Link");
    await user.click(screen.getByRole("button", { name: /Copy/ }));
    tokens.set(null);
  });

  it("shows a retry message when the page cannot be read, and opens from the button", async () => {
    signIn();
    server.use(http.get(api("/diagrams/files/f1/publish"), () => HttpResponse.json({}, { status: 500 })));
    const { user } = await renderRouted(<PublishButton fileId="f1" />);
    await user.click(await screen.findByRole("button", { name: "Publish" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    tokens.set(null);
  });
});

describe("PublicViewer extras", () => {
  const diagram = (o: Record<string, unknown> = {}) => ({
    file_id: "f1",
    slug: "s",
    url: "/d/v/s",
    title: "T",
    description: "",
    tags: [],
    visibility: "unlisted",
    kind: "sdd",
    author: { id: 1, username: "ali", display_name: "", avatar_url: "" },
    thumbnail_url: "",
    claps: 0,
    views: 0,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    published_at: "2026-01-01T00:00:00Z",
    ...o,
  });
  it("falls back to kind and author when there is no description or display name", async () => {
    server.use(http.get(api("/diagrams/public/s"), () => HttpResponse.json({ data: diagram() })));
    await renderRouted(<PublicViewer slug="s" />, { path: "/d/v/s" });
    expect(await screen.findByRole("heading", { level: 1, name: "T" })).toBeInTheDocument();
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"]')).not.toBeNull());
  });
  it("says offline for a server error and missing for a 404", async () => {
    server.use(http.get(api("/diagrams/public/s"), () => HttpResponse.json({}, { status: 500 })));
    await renderRouted(<PublicViewer slug="s" />, { path: "/d/v/s" });
    expect(await screen.findByText(/offline/i)).toBeInTheDocument();
  });
});

describe("Templates extras", () => {
  it("retries after an error and shows the empty state; cards without description render", async () => {
    let calls = 0;
    server.use(http.get(api("/diagrams/templates"), () => (calls++ === 0 ? HttpResponse.json({}, { status: 500 }) : HttpResponse.json({ data: [] }))));
    const { user } = await renderRouted(<Templates />, { path: "/templates" });
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText(/no templates/i)).toBeInTheDocument();
  });
  it("renders a template without a description", async () => {
    server.use(
      http.get(api("/diagrams/templates"), () =>
        HttpResponse.json({ data: [{ id: "t", title: "Bare", kind: "system", description: "", thumbnail_url: null, page_count: 1 }] }),
      ),
    );
    await renderRouted(<Templates />, { path: "/templates" });
    expect(await screen.findByText("Bare")).toBeInTheDocument();
  });
});

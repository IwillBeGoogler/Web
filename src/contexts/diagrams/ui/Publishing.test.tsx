import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { tokens } from "@/shared/api";
import { makePost, page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";

type Props = Record<string, unknown>;
const editor = vi.fn<(p: Props) => void>();
vi.mock("@diagram-editor", () => ({
  hasUnsavedChanges: () => false,
  confirmLeave: async () => true,
  DiagramEditor: (p: Props) => {
    editor(p);
    return <div data-testid="editor" />;
  },
}));

const { PublishDialog, PublishButton } = await import("./PublishDialog");
const { PublicViewer } = await import("./PublicViewer");
const { Templates } = await import("./Templates");
const { DiagramPicker } = await import("./DiagramPicker");
const { DiagramList } = await import("./DiagramList");
const { userDiagramsQuery } = await import("../application/hooks");

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
const diagram = (o: Record<string, unknown> = {}) => ({
  file_id: "f1",
  slug: "checkout-1a2b3c4d",
  url: "/d/v/checkout-1a2b3c4d",
  title: "Checkout flow",
  description: "How we pay",
  tags: ["payments"],
  visibility: "public",
  kind: "sdd",
  page_count: 1,
  thumbnail_url: "/api/diagrams/assets/abc",
  published_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-02T00:00:00Z",
  author: { id: 1, username: "ali", display_name: "Ali V", avatar_url: "" },
  ...o,
});

describe("PublishDialog", () => {
  it("publishes with visibility, title, description and tags, then shows the link; unpublish makes it private", async () => {
    signIn();
    let state = pub();
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.get(api("/diagrams/files/f1/publish"), () => HttpResponse.json(state)),
      http.post(api("/diagrams/files/f1/publish"), async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        state = pub({ ...sent, slug: "checkout-1a2b3c4d", url: "/d/v/checkout-1a2b3c4d", publishedAt: 1_700_000_000_000 });
        return HttpResponse.json(state);
      }),
      http.delete(api("/diagrams/files/f1/publish"), () => {
        state = pub({ slug: "checkout-1a2b3c4d" });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderRouted(<PublishDialog fileId="f1" open onOpenChange={() => undefined} />);
    await user.type(await screen.findByLabelText("Title"), "Checkout flow");
    await user.type(screen.getByLabelText("Description"), "How we pay");
    await user.type(screen.getByLabelText("Topics"), "#Payments, uml");
    await user.click(screen.getByRole("radio", { name: /Public/ }));
    await user.click(screen.getByRole("button", { name: "Publish" }));
    await waitFor(() => expect(sent).toEqual({ visibility: "public", title: "Checkout flow", description: "How we pay", tags: ["payments", "uml"] }));
    const link = (await screen.findByLabelText("Link")) as HTMLInputElement;
    expect(link.value).toMatch(/\/d\/v\/checkout-1a2b3c4d$/);
    await user.click(screen.getByRole("button", { name: "Unpublish" }));
    await waitFor(() => expect(screen.queryByLabelText("Link")).not.toBeInTheDocument());
    expect(screen.getByRole("button", { name: "Publish" })).toBeInTheDocument();
    tokens.set(null);
  });

  it("the toolbar button says whether the file is already live", async () => {
    signIn();
    server.use(http.get(api("/diagrams/files/f1/publish"), () => HttpResponse.json(pub({ visibility: "unlisted", slug: "s-123456", url: "/d/v/s-123456" }))));
    await renderRouted(<PublishButton fileId="f1" />);
    expect(await screen.findByRole("button", { name: "Published" })).toBeInTheDocument();
    tokens.set(null);
  });
});

describe("PublicViewer", () => {
  it("shows the byline, tags and share for anonymous visitors and opens the editor read-only by slug", async () => {
    server.use(http.get(api("/diagrams/public/checkout-1a2b3c4d"), () => HttpResponse.json({ data: diagram() })));
    await renderRouted(<PublicViewer slug="checkout-1a2b3c4d" />, { path: "/d/v/checkout-1a2b3c4d" });
    expect(await screen.findByRole("heading", { level: 1, name: "Checkout flow" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "@ali" })).toHaveAttribute("href", "/@ali");
    expect(screen.getByRole("link", { name: /#payments/ })).toHaveAttribute("href", "/tag/payments");
    expect(screen.getByRole("button", { name: /Share/ })).toBeInTheDocument();
    await screen.findByTestId("editor");
    const p = editor.mock.calls.at(-1)?.[0] as Props;
    expect(p.slug).toBe("checkout-1a2b3c4d");
    expect(p.user).toBeNull();
    expect(p.fileId).toBeUndefined();
    expect((p.getAuthHeaders as () => unknown)()).toEqual({});
    expect(p.features).toMatchObject({ comments: false, sharing: false, realtime: false });
    await waitFor(() => expect(document.title).toBe("Checkout flow — iBlog"));
    expect(document.head.querySelector('meta[property="og:image"]')?.getAttribute("content")).toMatch(/\/api\/diagrams\/assets\/abc$/);
    expect(document.head.querySelector('meta[name="robots"]')).toBeNull();
  });

  it("reports a diagram: dialog -> POST /reports with target_type diagram and the file id", async () => {
    signIn();
    let body: Record<string, unknown> | null = null;
    server.use(
      http.get(api("/diagrams/public/checkout-1a2b3c4d"), () => HttpResponse.json({ data: diagram() })),
      http.post(api("/reports"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: {} }, { status: 201 });
      }),
    );
    await renderRouted(<PublicViewer slug="checkout-1a2b3c4d" />, { path: "/d/v/checkout-1a2b3c4d" });
    fireEvent.click(await screen.findByRole("button", { name: /Report/ }));
    fireEvent.click(await screen.findByLabelText(/Spam/));
    fireEvent.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(body).toMatchObject({ target_type: "diagram", target_file_id: "f1", reason: "spam" }));
    tokens.set(null);
  });

  it("claps and saves a published diagram like a story, for signed-in readers only", async () => {
    signIn();
    const claps: unknown[] = [];
    const saved: string[] = [];
    server.use(
      http.get(api("/diagrams/public/checkout-1a2b3c4d"), () => HttpResponse.json({ data: diagram({ claps: 10 }) })),
      http.get(api("/diagrams/public/checkout-1a2b3c4d/me"), () => HttpResponse.json({ data: { my_claps: 2, bookmarked: false } })),
      http.post(api("/diagrams/public/checkout-1a2b3c4d/clap"), async ({ request }) => {
        claps.push(await request.json());
        return HttpResponse.json({ data: { claps: 11, my_claps: 3 } });
      }),
      http.post(api("/diagrams/public/checkout-1a2b3c4d/bookmark"), () => {
        saved.push("save");
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete(api("/diagrams/public/checkout-1a2b3c4d/bookmark"), () => {
        saved.push("unsave");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderRouted(<PublicViewer slug="checkout-1a2b3c4d" />, { path: "/d/v/checkout-1a2b3c4d" });
    const clap = await screen.findByRole("button", { name: "Spark. 10 sparks total, you gave 2" });
    await user.click(clap);
    expect(await screen.findByRole("button", { name: "Spark. 11 sparks total, you gave 3" })).toBeInTheDocument();
    await waitFor(() => expect(claps).toEqual([{ count: 1 }]), { timeout: 2000 });
    await user.click(screen.getByRole("button", { name: "Save for later" }));
    await user.click(await screen.findByRole("button", { name: "Remove from saved" }));
    await waitFor(() => expect(saved).toEqual(["save", "unsave"]));
    tokens.set(null);
  });

  it("asks anonymous readers to sign in instead of clapping", async () => {
    server.use(http.get(api("/diagrams/public/checkout-1a2b3c4d"), () => HttpResponse.json({ data: diagram({ claps: 4 }) })));
    const { user } = await renderRouted(<PublicViewer slug="checkout-1a2b3c4d" />, { path: "/d/v/checkout-1a2b3c4d" });
    await user.click(await screen.findByRole("button", { name: "Spark. 4 sparks total" }));
    expect(authDialog.get()).toBe("signin");
    authDialog.close();
  });

  it("keeps unlisted diagrams out of search results and says so when it is gone", async () => {
    server.use(http.get(api("/diagrams/public/u-123456"), () => HttpResponse.json({ data: diagram({ visibility: "unlisted", slug: "u-123456" }) })));
    await renderRouted(<PublicViewer slug="u-123456" />);
    await screen.findByRole("heading", { level: 1 });
    await waitFor(() => expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe("noindex"));
  });

  it("shows not found for an unpublished diagram", async () => {
    server.use(http.get(api("/diagrams/public/gone-123456"), () => HttpResponse.json({ status: 404, detail: "not found" }, { status: 404 })));
    await renderRouted(<PublicViewer slug="gone-123456" />);
    expect(await screen.findByText("This diagram isn't published.")).toBeInTheDocument();
  });
});

describe("Templates", () => {
  const tpls = [
    { id: "tpl_1", title: "URL shortener", kind: "system", description: "d", thumbnail_url: null, page_count: 1 },
    { id: "tpl_2", title: "Shop schema", kind: "db", description: "d", thumbnail_url: null, page_count: 2 },
    { id: "tpl_3", title: "Parking lot", kind: "ood", description: "d", thumbnail_url: null, page_count: 1 },
  ];
  it("filters by kind, forks the chosen template and ends on the new file", async () => {
    signIn();
    server.use(
      http.get(api("/diagrams/templates"), () => HttpResponse.json({ data: tpls })),
      http.post(api("/diagrams/templates/tpl_2/fork"), () =>
        HttpResponse.json(
          {
            project: { id: "p9", name: "Shop schema", role: "owner", createdAt: 1, updatedAt: 1 },
            file: { id: "f9", projectId: "p9", folderId: null, name: "Shop schema", kind: "erd", createdAt: 1, updatedAt: 1 },
          },
          { status: 201 },
        ),
      ),
    );
    const { user, router } = await renderRouted(<Templates />, { path: "/templates" });
    expect(await screen.findByText("URL shortener")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /DB/ }));
    expect(screen.queryByText("URL shortener")).not.toBeInTheDocument();
    expect(screen.queryByText("Parking lot")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Use template" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/f/f9"));
    tokens.set(null);
  });
});

describe("DiagramPicker", () => {
  it("lists my published diagrams with a visibility badge, loads more, and inserts the ::diagram line; a pasted link works too", async () => {
    signIn();
    const row = (i: number, visibility: string) => ({
      fileId: `f${i}`,
      slug: i === 1 ? "checkout-1a2b3c4d" : `s-${i}`,
      title: i === 1 ? "Checkout flow" : `Diagram ${i}`,
      visibility,
      thumbnailUrl: null,
      publishedAt: 1,
    });
    server.use(
      http.get(api("/diagrams/published"), ({ request }) => {
        const pg = Number(new URL(request.url).searchParams.get("page") ?? 1);
        return HttpResponse.json(
          pg === 1
            ? { items: [row(1, "unlisted"), row(2, "public")], total: 3, page: 1, pageSize: 2 }
            : { items: [row(3, "public")], total: 3, page: 2, pageSize: 2 },
        );
      }),
    );
    const onPick = vi.fn();
    const { user } = await renderRouted(<DiagramPicker open onOpenChange={() => undefined} onPick={onPick} />);
    const first = await screen.findByRole("button", { name: /Checkout flow/ });
    expect(within(first).getByText("Unlisted")).toBeInTheDocument();
    expect(screen.queryByText("Diagram 3")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Diagram 3")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show more" })).not.toBeInTheDocument();
    await user.click(first);
    expect(onPick).toHaveBeenCalledWith("::diagram{slug=checkout-1a2b3c4d}");
    await user.type(screen.getByLabelText("Or paste a diagram link"), "nope");
    await user.click(screen.getByRole("button", { name: "Insert" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("isn't a diagram link");
    await user.clear(screen.getByLabelText("Or paste a diagram link"));
    await user.type(screen.getByLabelText("Or paste a diagram link"), "https://x.io/d/v/hidden-9f8e7d6c");
    await user.click(screen.getByRole("button", { name: "Insert" }));
    expect(onPick).toHaveBeenLastCalledWith("::diagram{slug=hidden-9f8e7d6c}");
    tokens.set(null);
  });
});

describe("DiagramList", () => {
  it("renders cards linking to the viewer, and an empty state", async () => {
    server.use(
      http.get(api("/users/ali/diagrams"), () => page([diagram()])),
      http.get(api("/users/bo/diagrams"), () => page([])),
    );
    const a = await renderRouted(<DiagramList query={userDiagramsQuery("ali")} empty={{ title: "none" }} />);
    const card = await screen.findByRole("link", { name: /Checkout flow/ });
    expect(card).toHaveAttribute("href", "/d/v/checkout-1a2b3c4d");
    expect(within(card.closest("article") as HTMLElement).getByRole("link", { name: "#payments" })).toBeInTheDocument();
    expect(within(card.closest("article") as HTMLElement).queryByLabelText(/sparks/)).toBeNull(); // no claps, no count
    a.unmount();
    await renderRouted(<DiagramList query={userDiagramsQuery("bo")} empty={{ title: "none" }} />);
    expect(await screen.findByText("none")).toBeInTheDocument();
  });
});

describe("DiagramCard", () => {
  it("shows the claps of a clapped diagram", async () => {
    server.use(http.get(api("/users/ali/diagrams"), () => page([diagram({ claps: 1234 })])));
    await renderRouted(<DiagramList query={userDiagramsQuery("ali")} empty={{ title: "none" }} />);
    expect(await screen.findByLabelText("1234 sparks")).toHaveTextContent("1.2K");
  });
});

describe("story reader", () => {
  it("keeps the diagram embed figure and its link through sanitizing", async () => {
    const { ArticlePage } = await import("@/app/pages/ArticlePage");
    server.use(
      http.get(api("/slug/hello-iblog"), () =>
        HttpResponse.json({
          data: makePost({
            body_html:
              '<figure class="diagram-embed" data-file="f1" data-page="1"><a href="/d/v/checkout-1a2b3c4d"><img src="/api/diagrams/assets/abc" alt="Checkout"><figcaption>Checkout</figcaption></a></figure>',
          }),
        }),
      ),
      http.get(api("/users/ali"), () => HttpResponse.json({ data: { id: 1, username: "ali", display_name: "Ali V", created_at: "x", is_following: false } })),
      http.get(api("/posts/1/related"), () => HttpResponse.json({ data: [] })),
      http.post(api("/posts/1/view"), () => new HttpResponse(null, { status: 204 })),
    );
    const { container, user, router } = await renderRouted(<ArticlePage slug="hello-iblog" />, { path: "/@ali/hello-iblog" });
    const fig = await waitFor(() => {
      const f = container.querySelector("figure.diagram-embed");
      expect(f).not.toBeNull();
      return f as HTMLElement;
    });
    expect(fig.querySelector("a")?.getAttribute("href")).toBe("/d/v/checkout-1a2b3c4d");
    await user.click(fig.querySelector("a") as HTMLElement);
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/v/checkout-1a2b3c4d"));
  });
});

import { act, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { tokens } from "@/shared/api";
import { makePost, me, page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { HOME_REPLAY } from "../layout/Logo";
import { HomeGrid, HomePage } from "./HomePage";

const part = (position: number, status = "published") => ({ position, post_id: position, title: `Part ${position}`, slug: `part-${position}`, status });
const aSeries = (id: number, author: string, parts: ReturnType<typeof part>[], description = "") => ({
  id,
  slug: `s${id}`,
  title: `Series ${id}`,
  description,
  user_id: id,
  author,
  parts: parts.length,
  posts: parts,
});
const prof = (username: string, followers: number, o: Record<string, unknown> = {}) => ({
  id: followers,
  username,
  display_name: `${username} name`,
  bio: "bio",
  avatar_url: "",
  created_at: "2026-01-01T00:00:00Z",
  posts: 1,
  followers,
  following: 0,
  is_following: false,
  is_subscribed: false,
  pinned_post_id: 0,
  ...o,
});

const trending = [
  makePost({ id: 1, title: "T one", author: "ali", cover_url: "https://x.test/c.png", subtitle: "" }),
  makePost({ id: 2, title: "T two", author: "bob", subtitle: "has sub" }),
  makePost({ id: 3, title: "T three", author: "", body: "", subtitle: "" }),
  makePost({ id: 4, title: "T four", author: "ali" }),
  makePost({ id: 5, title: "T five", author: "bob" }),
];
const latest = [
  makePost({ id: 11, title: "Latest A", claps: 50, cover_url: "https://x.test/l.png" }),
  makePost({ id: 12, title: "", claps: 20, author: "cy" }),
  makePost({ id: 13, title: "Quiet", claps: 0 }),
];

function publicApi(over: { trending?: unknown[]; tags?: unknown[]; latest?: unknown[]; series?: Record<string, unknown[]> } = {}) {
  server.use(
    http.get(api("/posts/trending"), () => HttpResponse.json({ data: over.trending ?? trending })),
    http.get(api("/tags"), () =>
      HttpResponse.json({
        data: over.tags ?? [
          { name: "go", count: 3 },
          { name: "rust", count: 2000 },
        ],
      }),
    ),
    http.get(api("/posts"), ({ request }) => {
      const tag = new URL(request.url).searchParams.get("tag");
      if (tag === "rust") return page([]);
      if (tag) return page([makePost({ id: 99, title: `In ${tag}`, tags: [tag] })]);
      return page(over.latest ?? latest, { total: 1500 });
    }),
    http.get(api("/users/:u"), ({ params }) => {
      const u = String(params.u);
      return u === "bob"
        ? HttpResponse.json({ data: prof("bob", 9, { bio: "", display_name: "" }) })
        : HttpResponse.json({ data: prof(u, u === "ali" ? 20 : 4) });
    }),
    http.get(api("/users/:u/series"), ({ params }) => HttpResponse.json({ data: over.series?.[String(params.u)] ?? [] })),
    http.get(api("/me/for-you"), () => page([makePost({ title: "For you story" })])),
    http.get(api("/me/feed"), () => page([])),
  );
}

function signedInApi(over: { writers?: unknown[]; lists?: unknown[]; saved?: unknown; drafts?: unknown } = {}) {
  signIn();
  server.use(
    http.get(api("/me/suggestions/users"), () =>
      HttpResponse.json({ data: over.writers ?? [{ id: 8, username: "wri", display_name: "Wri Ter", avatar_url: "", followers: 1200 }] }),
    ),
    http.get(api("/me/lists"), () => page(over.lists ?? [])),
    http.get(api("/me/bookmarks"), () =>
      over.saved === "err"
        ? HttpResponse.json({ detail: "x" }, { status: 500 })
        : page(
            (over.saved as unknown[]) ?? [makePost({ id: 21, title: "Saved A", cover_url: "https://x.test/s.png" }), makePost({ id: 22, title: "Saved B" })],
          ),
    ),
    http.get(api("/me/posts"), () =>
      over.drafts === "err"
        ? HttpResponse.json({ detail: "x" }, { status: 500 })
        : page(
            (over.drafts as unknown[]) ?? [
              makePost({ id: 31, title: "", status: "draft", updated_at: "" }),
              makePost({ id: 32, title: "Draft B", status: "draft", updated_at: "2026-10-01T00:00:00Z" }),
            ],
          ),
    ),
  );
}

afterEach(() => {
  tokens.set(null);
  authDialog.close();
  vi.restoreAllMocks();
});

describe("HomePage signed out", () => {
  it("landing page when no tab; logo replay remounts it (throttled)", async () => {
    publicApi();
    const now = vi.spyOn(Date, "now").mockReturnValue(10_000);
    await renderRouted(<HomePage tab={undefined} />);
    expect(screen.getByRole("heading", { level: 1, name: /Ideas worth/ })).toBeInTheDocument();
    act(() => {
      dispatchEvent(new Event(HOME_REPLAY));
      dispatchEvent(new Event(HOME_REPLAY));
    });
    now.mockReturnValue(20_000);
    act(() => {
      dispatchEvent(new Event(HOME_REPLAY));
    });
    expect(screen.getByRole("heading", { level: 1, name: /Ideas worth/ })).toBeInTheDocument();
  });

  it("latest feed: spotlight, rising, topics, top posts, series, categories, writers", async () => {
    publicApi({
      series: {
        ali: [aSeries(1, "ali", [part(2), part(1), part(3, "draft")], "A desc"), aSeries(2, "ali", [part(1)])],
        bob: [aSeries(3, "bob", [part(1), part(2), part(3)])],
      },
    });
    const { user } = await renderRouted(<HomePage tab="latest" />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Fresh on");
    expect((await screen.findAllByText("T one")).length).toBeGreaterThan(0);
    expect(await screen.findByText("Rising")).toBeInTheDocument();
    expect(await screen.findByText("Most sparked lately")).toBeInTheDocument();
    expect(await screen.findByText("Read in order")).toBeInTheDocument();
    expect(await screen.findAllByText("Series 1")).toHaveLength(1);
    expect(screen.getByText("A desc")).toBeInTheDocument();
    expect(await screen.findByText("Categories")).toBeInTheDocument();
    expect(await screen.findByText("Writers to watch")).toBeInTheDocument();
    expect(await screen.findAllByText("In go")).not.toHaveLength(0);
    expect((await screen.findAllByText("No stories yet.")).length).toBeGreaterThan(0);
    expect(await screen.findByText("1.5K stories")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Join free" }));
    expect(authDialog.get()).toBe("signup");
    await user.click(screen.getByRole("radio", { name: /Your circle/ }));
    expect(authDialog.get()).toBe("signin");
  });

  it("few trending: single-column spotlight, hidden shelves", async () => {
    publicApi({ trending: [trending[0]], latest: [], tags: [], series: {} });
    await renderRouted(<HomePage tab="latest" />);
    expect((await screen.findAllByText("T one")).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText("Rising")).toBeNull());
    expect(screen.queryByText("Topics")).toBeNull();
    expect(screen.queryByText("Categories")).toBeNull();
    expect(screen.queryByText("Most sparked lately")).toBeNull();
    expect(screen.queryByText("Read in order")).toBeNull();
    expect(await screen.findByText("No stories yet.")).toBeInTheDocument();
  });

  it("empty trending hides spotlight; ?tab=following falls back to latest", async () => {
    publicApi({ trending: [], latest: [] });
    await renderRouted(<HomePage tab="following" />);
    expect(await screen.findByText("The stream")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("Spotlight")).toBeNull());
  });
});

describe("HomePage signed in", () => {
  it("desk panels, lists strip, lens navigation", async () => {
    publicApi();
    signedInApi({
      lists: [
        { id: 1, slug: "pub", name: "Pub list", private: false, posts: 3 },
        { id: 2, slug: "priv", name: "Priv list", private: true, posts: 1 },
      ],
    });
    vi.spyOn(Date.prototype, "getHours").mockReturnValue(8);
    const { user, router } = await renderRouted(<HomePage tab={undefined} />);
    expect(await screen.findByText(/Morning, Admin\./)).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: "New draft" })).toBeInTheDocument();
    expect(await screen.findByText("Saved A")).toBeInTheDocument();
    expect(screen.getByText("Saved B")).toBeInTheDocument();
    expect(await screen.findByText("Untitled draft")).toBeInTheDocument();
    expect(screen.getByText("Draft B")).toBeInTheDocument();
    expect(await screen.findByText("Wri Ter")).toBeInTheDocument();
    expect(await screen.findByText("Pub list")).toBeInTheDocument();
    expect(screen.getByLabelText("Private")).toBeInTheDocument();
    expect(await screen.findByText("For you story")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Newest/ }));
    await waitFor(() => expect(router.state.location.search).toMatchObject({ tab: "latest" }));
  });

  it("afternoon / evening greetings, no display name uses username fallback", async () => {
    publicApi();
    signedInApi({ writers: [], saved: [], drafts: [] });
    server.use(http.get(api("/me"), () => HttpResponse.json({ data: { ...me, display_name: "" } })));
    const hours = vi.spyOn(Date.prototype, "getHours").mockReturnValue(14);
    const first = await renderRouted(<HomePage tab="latest" />);
    expect(await screen.findByText(/Afternoon, admin\./)).toBeInTheDocument();
    expect(await screen.findByText("Bookmark a story and it waits here.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Start a draft" })).toBeInTheDocument();
    first.unmount();
    hours.mockReturnValue(22);
    await renderRouted(<HomePage tab="latest" />);
    expect(await screen.findByText(/Evening, admin\./)).toBeInTheDocument();
  });

  it("following tab hides spotlight and shows quiet-circle empty state", async () => {
    publicApi();
    signedInApi();
    await renderRouted(<HomePage tab="following" />);
    expect(await screen.findByText("Your circle is quiet.")).toBeInTheDocument();
    expect(screen.queryByText("Spotlight")).toBeNull();
    expect(await screen.findByText("Writers to watch")).toBeInTheDocument();
  });

  it("desk shows errors for saved and drafts", async () => {
    publicApi();
    signedInApi({ saved: "err", drafts: "err" });
    await renderRouted(<HomePage tab="latest" />);
    expect(await screen.findByText("Couldn't load saved stories.")).toBeInTheDocument();
    expect(await screen.findByText("Couldn't load drafts.")).toBeInTheDocument();
  });

  it("token without profile yet: join button, no desk, no public writers", async () => {
    publicApi();
    tokens.set({ token: "t", expiresAt: "2030-01-01T00:00:00Z" });
    server.use(http.get(api("/me"), () => HttpResponse.json({ detail: "x" }, { status: 500 })));
    await renderRouted(<HomePage tab="latest" />);
    expect(await screen.findByRole("button", { name: "Join free" })).toBeInTheDocument();
    expect(screen.queryByText("Your desk")).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Here's your desk.");
  });
});

describe("HomeGrid", () => {
  it("renders children with sidebar by default and bare without", async () => {
    publicApi();
    server.use(http.get(api("/me/suggestions/users"), () => HttpResponse.json({ data: [] })));
    const a = await renderRouted(
      <HomeGrid>
        <p>child-a</p>
      </HomeGrid>,
    );
    expect(screen.getByText("child-a")).toBeInTheDocument();
    a.unmount();
    await renderRouted(
      <HomeGrid aside={false}>
        <p>child-b</p>
      </HomeGrid>,
    );
    expect(screen.getByText("child-b")).toBeInTheDocument();
  });
});

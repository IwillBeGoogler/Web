import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePost, page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { ImportStory, StatsPage, StoryList } from "./Studio";

const stat = (o: Record<string, unknown> = {}) => ({
  post_id: 1,
  title: "Alpha",
  slug: "alpha",
  status: "published",
  published_at: "2026-10-01T00:00:00Z",
  views: 1200,
  reads: 300,
  read_ratio: 0.25,
  claps: 7,
  comments: 2,
  ...o,
});

afterEach(() => vi.restoreAllMocks());

describe("StoryList", () => {
  it("shows an empty state per status", async () => {
    signIn();
    server.use(
      http.get(api("/me/posts"), () => page([])),
      http.get(api("/users/admin"), () => HttpResponse.json({ data: { id: 3, username: "admin", created_at: "x" } })),
    );
    await renderRouted(<StoryList status="draft" />);
    expect(await screen.findByText("You have no drafts.")).toBeInTheDocument();
  });

  it("empty state names the status for non-drafts", async () => {
    signIn();
    server.use(http.get(api("/me/posts"), () => page([])));
    await renderRouted(<StoryList status="scheduled" />);
    expect(await screen.findByText("You have no scheduled stories.")).toBeInTheDocument();
  });

  it("lists draft, scheduled and published rows with the right captions", async () => {
    signIn();
    server.use(
      http.get(api("/me/posts"), () =>
        page([
          makePost({ id: 1, title: "Pub", status: "published", slug: "pub", author: "admin" }),
          makePost({ id: 2, title: "Dr", status: "draft", slug: "dr" }),
          makePost({ id: 3, title: "", status: "scheduled", slug: "sc", publish_at: "2030-01-01T00:00:00Z" }),
        ]),
      ),
      http.get(api("/users/admin"), () => HttpResponse.json({ data: { id: 3, username: "admin", created_at: "x", pinned_post_id: 1 } })),
    );
    await renderRouted(<StoryList status="published" />);
    expect(await screen.findByRole("link", { name: "Pub" })).toHaveAttribute("href", "/@admin/pub");
    await waitFor(() => expect(screen.getByText(/Live since/)).toHaveTextContent("Pinned"));
    expect(screen.getByText(/Last edited/)).toBeInTheDocument();
    expect(screen.getByText(/Scheduled for/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Untitled story" })).toHaveAttribute("href", "/p/3/edit");
  });

  it("loads more", async () => {
    signIn();
    server.use(
      http.get(api("/me/posts"), ({ request }) =>
        new URL(request.url).searchParams.get("cursor")
          ? page([makePost({ id: 9, title: "Second", slug: "s" })])
          : page([makePost({ id: 1, title: "First" })], { has_more: true, next_cursor: "c" }),
      ),
    );
    const { user } = await renderRouted(<StoryList status="published" />);
    await user.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Second")).toBeInTheDocument();
  });

  it("pins, unpins, deletes (confirm yes/no) from the row menu", async () => {
    signIn();
    const calls: string[] = [];
    server.use(
      http.get(api("/me/posts"), () => page([makePost({ id: 1, title: "Pub", author: "admin" })])),
      http.get(api("/users/admin"), () => HttpResponse.json({ data: { id: 3, username: "admin", created_at: "x", pinned_post_id: 0 } })),
      http.put(api("/me/pin"), () => (calls.push("pin"), new HttpResponse(null, { status: 204 }))),
      http.delete(api("/me/pin"), () => (calls.push("unpin"), new HttpResponse(null, { status: 204 }))),
      http.delete(api("/posts/1"), () => (calls.push("delete"), new HttpResponse(null, { status: 204 }))),
    );
    const { user } = await renderRouted(<StoryList status="published" />);
    const open = async () => user.click(await screen.findByRole("button", { name: "Actions for Pub" }));
    await open();
    expect(screen.getByRole("menuitem", { name: "Edit story" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "View stats" })).toBeInTheDocument();
    await user.click(screen.getByRole("menuitem", { name: "Pin to profile" }));
    await waitFor(() => expect(calls).toEqual(["pin"]));

    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await open();
    await user.click(screen.getByRole("menuitem", { name: "Delete story" }));
    expect(calls).toEqual(["pin"]);
    await open();
    await user.click(screen.getByRole("menuitem", { name: "Delete story" }));
    await waitFor(() => expect(calls).toContain("delete"));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it("unpin when already pinned; drafts have no pin or stats items; pin errors toast", async () => {
    signIn();
    let fail = false;
    server.use(
      http.get(api("/me/posts"), () => page([makePost({ id: 1, title: "Pub", author: "admin" }), makePost({ id: 2, title: "Dr", status: "draft" })])),
      http.get(api("/users/admin"), () => HttpResponse.json({ data: { id: 3, username: "admin", created_at: "x", pinned_post_id: 1 } })),
      http.delete(api("/me/pin"), () => (fail ? HttpResponse.json({ status: 500, detail: "no" }, { status: 500 }) : new HttpResponse(null, { status: 204 }))),
    );
    const { user } = await renderRouted(<StoryList status="published" />);
    await screen.findByText(/Pinned/);
    await user.click(await screen.findByRole("button", { name: "Actions for Dr" }));
    expect(screen.queryByRole("menuitem", { name: /pin/i })).toBeNull();
    await user.keyboard("{Escape}");
    await user.click(screen.getByRole("button", { name: "Actions for Pub" }));
    fail = true;
    await user.click(await screen.findByRole("menuitem", { name: "Unpin from profile" }));
    await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).not.toBeNull());
  });
});

describe("ImportStory", () => {
  it("imports a URL into a draft and navigates to its editor", async () => {
    server.use(http.post(api("/posts/import"), () => HttpResponse.json({ data: makePost({ id: 42 }) })));
    const { user, router } = await renderRouted(<ImportStory />);
    await user.click(screen.getByRole("button", { name: /Import a story/ }));
    const dialog = await screen.findByRole("dialog");
    const submit = within(dialog).getByRole("button", { name: "Import" });
    expect(submit).toBeDisabled();
    await user.type(within(dialog).getByLabelText("URL"), "https://example.com/a");
    await user.click(submit);
    await waitFor(() => expect(router.state.location.pathname).toBe("/p/42/edit"));
  });

  it("submitting a non-URL via Enter does nothing", async () => {
    let hit = 0;
    server.use(http.post(api("/posts/import"), () => (hit++, HttpResponse.json({ data: makePost() }))));
    const { user } = await renderRouted(<ImportStory />);
    await user.click(screen.getByRole("button", { name: /Import a story/ }));
    await user.type(await screen.findByLabelText("URL"), "nope{Enter}");
    expect(hit).toBe(0);
  });

  it("shows the server error", async () => {
    server.use(http.post(api("/posts/import"), () => HttpResponse.json({ status: 422, detail: "cannot fetch that" }, { status: 422 })));
    const { user } = await renderRouted(<ImportStory />);
    await user.click(screen.getByRole("button", { name: /Import a story/ }));
    await user.type(await screen.findByLabelText("URL"), "https://example.com/a");
    await user.click(screen.getByRole("button", { name: "Import" }));
    expect(await screen.findByText(/cannot fetch that/)).toBeInTheDocument();
  });
});

describe("StatsPage", () => {
  it("shows the empty state", async () => {
    server.use(http.get(api("/me/stats"), () => page([])));
    await renderRouted(<StatsPage />);
    expect(await screen.findByText("No stats yet.")).toBeInTheDocument();
  });

  it("totals, rows, and the per-day chart toggle with period switch", async () => {
    server.use(
      http.get(api("/me/stats"), () => page([stat(), stat({ post_id: 2, title: "Beta", views: 10, reads: 1 })])),
      http.get(api("/me/stats/1"), ({ request }) => {
        const days = Number(new URL(request.url).searchParams.get("days"));
        return HttpResponse.json({ data: { post_id: 1, days: [{ date: "2026-10-01", views: days, reads: 1 }] } });
      }),
    );
    const { user } = await renderRouted(<StatsPage post={1} />);
    expect(await screen.findByRole("button", { name: "Alpha" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByText("25%")).toHaveLength(2);
    expect(await screen.findByRole("img", { name: /last 30 days, max 30/ })).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText("Period"), "7");
    expect(await screen.findByRole("img", { name: /last 7 days, max 7/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Alpha" }));
    expect(screen.queryByLabelText("Period")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Beta" }));
    expect(screen.getByRole("button", { name: "Beta" })).toHaveAttribute("aria-expanded", "true");
  });
});

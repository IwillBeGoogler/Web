import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { makePost, page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { MySeries, SeriesNav, SeriesPage, UserSeries } from "./Series";

const part = (position: number, post_id: number, o: Record<string, unknown> = {}) => ({
  position,
  post_id,
  title: `Part ${position}`,
  slug: `part-${position}`,
  status: "published",
  published_at: "2026-10-01T00:00:00Z",
  ...o,
});
const series = (o: Record<string, unknown> = {}) => ({
  id: 1,
  slug: "ser",
  title: "My Series",
  description: "About it",
  user_id: 3,
  author: "admin",
  parts: 2,
  posts: [part(1, 10), part(2, 11)],
  ...o,
});

afterEach(() => {
  tokens.set(null);
  vi.restoreAllMocks();
});

describe("SeriesNav", () => {
  it("renders nothing when post is in no series", async () => {
    server.use(http.get(api("/posts/1/series"), () => HttpResponse.json({ status: 404, detail: "x" }, { status: 404 })));
    const { qc } = await renderRouted(<SeriesNav postId={1} author="admin" />);
    await waitFor(() => expect(qc.isFetching()).toBe(0));
    expect(screen.queryByRole("navigation", { name: "Series" })).toBeNull();
  });

  it("shows position, parts, prev and next", async () => {
    server.use(
      http.get(api("/posts/11/series"), () =>
        HttpResponse.json({ data: { series: series(), position: 2, prev: part(1, 10), next: part(3, 12), posts: [part(1, 10), part(2, 11), part(3, 12)] } }),
      ),
    );
    await renderRouted(<SeriesNav postId={11} author="admin" />);
    expect(await screen.findByText(/Part 2 of 3/)).toBeInTheDocument();
    expect(screen.getByText("2. Part 2")).toHaveAttribute("aria-current", "page");
    expect(screen.getByRole("link", { name: "1. Part 1" })).toHaveAttribute("href", "/@admin/part-1");
    expect(screen.getByRole("link", { name: "Part 3" })).toBeInTheDocument();
  });

  it("without prev/next, falls back to series.parts count", async () => {
    server.use(http.get(api("/posts/10/series"), () => HttpResponse.json({ data: { series: series({ posts: null, parts: 5 }), position: 1 } })));
    await renderRouted(<SeriesNav postId={10} author="admin" />);
    expect(await screen.findByText(/Part 1 of 5/)).toBeInTheDocument();
  });
});

describe("SeriesPage", () => {
  it("lists parts incl. draft status", async () => {
    server.use(http.get(api("/series/ser"), () => HttpResponse.json({ data: series({ posts: [part(1, 10), part(2, 11, { status: "draft" })] }) })));
    await renderRouted(<SeriesPage slug="ser" />);
    expect(await screen.findByText("My Series")).toBeInTheDocument();
    expect(screen.getByText("About it")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("01")).toBeInTheDocument();
  });

  it("empty parts, no description", async () => {
    server.use(http.get(api("/series/ser"), () => HttpResponse.json({ data: series({ description: "", posts: null }) })));
    await renderRouted(<SeriesPage slug="ser" />);
    expect(await screen.findByText("No parts yet.")).toBeInTheDocument();
  });

  it("missing series", async () => {
    server.use(http.get(api("/series/ser"), () => HttpResponse.json({ status: 404, detail: "x" }, { status: 404 })));
    await renderRouted(<SeriesPage slug="ser" />);
    expect(await screen.findByText("This series doesn't exist.")).toBeInTheDocument();
  });
});

describe("UserSeries", () => {
  it("lists series with and without description", async () => {
    server.use(
      http.get(api("/users/ali/series"), () => HttpResponse.json({ data: [series(), series({ id: 2, slug: "b", title: "Other", description: "" })] })),
    );
    await renderRouted(<UserSeries username="ali" />);
    expect(await screen.findByText("My Series")).toBeInTheDocument();
    expect(screen.getByText("Other")).toBeInTheDocument();
    expect(screen.getByText("About it")).toBeInTheDocument();
  });

  it("empty", async () => {
    server.use(http.get(api("/users/ali/series"), () => HttpResponse.json({ data: [] })));
    await renderRouted(<UserSeries username="ali" />);
    expect(await screen.findByText("No series yet.")).toBeInTheDocument();
  });
});

describe("MySeries", () => {
  it("empty state and create a series", async () => {
    signIn();
    let created = 0;
    server.use(
      http.get(api("/users/admin/series"), () => HttpResponse.json({ data: [] })),
      http.post(api("/series"), () => {
        created++;
        return HttpResponse.json({ data: series() });
      }),
    );
    const { user } = await renderRouted(<MySeries />);
    expect(await screen.findByText("No series yet.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New series" }));
    await user.click(await screen.findByRole("button", { name: "Create series" }));
    expect(await screen.findByText("Give your series a title")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Title"), "T");
    await user.click(screen.getByRole("button", { name: "Create series" }));
    await waitFor(() => expect(created).toBe(1));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("closes the modal with Escape", async () => {
    signIn();
    server.use(http.get(api("/users/admin/series"), () => HttpResponse.json({ data: [] })));
    const { user } = await renderRouted(<MySeries />);
    await user.click(await screen.findByRole("button", { name: "New series" }));
    await screen.findByRole("dialog");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("edits a series, shows server error, and deletes with confirm", async () => {
    signIn();
    let patches = 0;
    let deleted = 0;
    server.use(
      http.get(api("/users/admin/series"), () => HttpResponse.json({ data: [series()] })),
      http.patch(api("/series/ser"), () => {
        patches++;
        return patches === 1 ? HttpResponse.json({ status: 500, detail: "bad" }, { status: 500 }) : HttpResponse.json({ data: series() });
      }),
      http.delete(api("/series/ser"), () => {
        deleted++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user } = await renderRouted(<MySeries />);
    expect(await screen.findByText("My Series")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Edit" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(patches).toBe(1));
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleted).toBe(0);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleted).toBe(1));
  });

  it("reorders, removes, adds parts and saves", async () => {
    signIn();
    let ids: unknown;
    server.use(
      http.get(api("/users/admin/series"), () => HttpResponse.json({ data: [series()] })),
      http.get(api("/series/ser"), () => HttpResponse.json({ data: series({ posts: [part(1, 10), part(2, 11), part(3, 99, { title: "Lone" })] }) })),
      http.get(api("/me/posts"), ({ request }) => {
        const st = new URL(request.url).searchParams.get("status");
        return st === "draft"
          ? page([makePost({ id: 21, title: "A draft", status: "draft" })])
          : page([makePost({ id: 10, title: "Pub ten" }), makePost({ id: 20, title: "Pub twenty" })]);
      }),
      http.put(api("/series/ser/posts"), async ({ request }) => {
        ids = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderRouted(<MySeries />);
    await user.click(await screen.findByRole("button", { name: "Parts" }));
    const dlg = await screen.findByRole("dialog");
    expect(await within(dlg).findByText("Lone")).toBeInTheDocument();
    expect(within(dlg).getByText("Pub ten")).toBeInTheDocument();
    expect(within(dlg).getByText("Part 2")).toBeInTheDocument();
    const ups = within(dlg).getAllByRole("button", { name: "Move up" });
    const downs = within(dlg).getAllByRole("button", { name: "Move down" });
    expect(ups[0]).toBeDisabled();
    expect(downs[2]).toBeDisabled();
    await user.click(downs[0] as HTMLElement);
    await user.click(within(dlg).getAllByRole("button", { name: "Move up" })[2] as HTMLElement);
    await user.click(within(dlg).getAllByRole("button", { name: "Remove part" })[0] as HTMLElement);
    const select = within(dlg).getByLabelText("Add a story");
    await user.selectOptions(select, "21");
    await user.selectOptions(select, "");
    await user.click(within(dlg).getByRole("button", { name: "Save order" }));
    await waitFor(() => expect(ids).toEqual({ post_ids: expect.any(Array) }));
    expect((ids as { post_ids: number[] }).post_ids).toHaveLength(3);
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("parts editor shows save error and hides add-select when none available", async () => {
    signIn();
    server.use(
      http.get(api("/users/admin/series"), () => HttpResponse.json({ data: [series({ posts: [part(1, 10)] })] })),
      http.get(api("/series/ser"), () => HttpResponse.json({ data: series({ posts: [part(1, 10)] }) })),
      http.get(api("/me/posts"), () => page([makePost({ id: 10, title: "Pub ten" })])),
      http.put(api("/series/ser/posts"), () => HttpResponse.json({ status: 500, detail: "nope" }, { status: 500 })),
    );
    const { user } = await renderRouted(<MySeries />);
    await user.click(await screen.findByRole("button", { name: "Parts" }));
    expect(await screen.findByText("1.")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByLabelText("Add a story")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Save order" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save order" })).toBeEnabled());
  });
});

import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import {
  ListRoute,
  LibraryPage,
  NotificationsPage,
  PublicationRoute,
  PublicationsPage,
  SeriesRoute,
  SettingsPage,
  StatsRoute,
  StoriesPage,
} from "./MePages";

vi.mock("@/contexts/account/ui/Settings", () => ({ Settings: ({ tab }: { tab: string }) => <div>settings:{tab}</div> }));
vi.mock("@/contexts/collections/ui/Lists", () => ({ MyLists: () => <div>mylists</div>, ListPage: ({ slug }: { slug: string }) => <div>list:{slug}</div> }));
vi.mock("@/contexts/collections/ui/Publications", () => ({
  MyPublications: () => <div>mypubs</div>,
  PublicationPage: ({ slug }: { slug: string }) => <div>pub:{slug}</div>,
}));
vi.mock("@/contexts/collections/ui/Series", () => ({ MySeries: () => <div>myseries</div>, SeriesPage: ({ slug }: { slug: string }) => <div>series:{slug}</div> }));
vi.mock("@/contexts/publishing/ui/Studio", () => ({
  ImportStory: () => <div>import</div>,
  StatsPage: ({ post }: { post?: number }) => <div>stats:{String(post)}</div>,
  StoryList: ({ status }: { status: string }) => <div>stories:{status}</div>,
}));

const feed = (data: object[], unread = data.length) =>
  server.use(http.get(api("/me/notifications"), () => HttpResponse.json({ data, meta: { page: 1, limit: 20, total: data.length, unread } })));

describe("MePages wrappers", () => {
  it("route wrappers render their pages", async () => {
    signIn();
    server.use(http.get(api("/me/notifications"), () => HttpResponse.json({ data: [], meta: { page: 1, limit: 20, total: 0, unread: 0 } })));
    await renderRouted(<PublicationsPage />);
    expect(await screen.findByText("mypubs")).toBeInTheDocument();
  });
  it("stats / list / series / publication routes", async () => {
    await renderRouted(
      <>
        <StatsRoute post={4} />
        <ListRoute slug="l" />
        <SeriesRoute slug="s" />
        <PublicationRoute slug="p" />
      </>,
    );
    for (const t of ["stats:4", "list:l", "series:s", "pub:p"]) expect(await screen.findByText(t)).toBeInTheDocument();
  });
  it("SettingsPage renders only when signed in", async () => {
    signIn();
    await renderRouted(<SettingsPage tab="profile" onTab={() => {}} />);
    expect(await screen.findByText("settings:profile")).toBeInTheDocument();
  });
  it("SettingsPage renders nothing when signed out", async () => {
    server.use(http.get(api("/me"), () => new HttpResponse(null, { status: 401 })));
    await renderRouted(<SettingsPage tab="profile" onTab={() => {}} />);
    expect(screen.queryByText("settings:profile")).toBeNull();
  });
});

describe("StoriesPage", () => {
  it("switches tabs", async () => {
    const { user } = await renderRouted(<StoriesPage />);
    expect(await screen.findByText("stories:draft")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Live" }));
    expect(await screen.findByText("stories:published")).toBeInTheDocument();
    await user.click(screen.getByRole("tab", { name: "Series" }));
    expect(await screen.findByText("myseries")).toBeInTheDocument();
  });
});

describe("LibraryPage lists tab", () => {
  it("shows my lists", async () => {
    signIn();
    server.use(http.get(api("/me/bookmarks"), () => page([])));
    const { user } = await renderRouted(<LibraryPage />);
    await user.click(await screen.findByRole("radio", { name: "Lists" }));
    expect(await screen.findByText("mylists")).toBeInTheDocument();
  });
});

describe("NotificationsPage extras", () => {
  it("empty state", async () => {
    signIn();
    feed([]);
    await renderRouted(<NotificationsPage />);
    expect(await screen.findByText("You're all caught up.")).toBeInTheDocument();
  });

  it("mark all read, read-only rows, show more", async () => {
    signIn();
    let marked = false;
    server.use(
      http.post(api("/me/notifications/read"), () => ((marked = true), new HttpResponse(null, { status: 204 }))),
      http.get(api("/me/notifications"), ({ request }) => {
        const p = new URL(request.url).searchParams.get("page") ?? "1";
        const rows =
          p === "1"
            ? [
                { id: 1, type: "follow", actor: "ali", created_at: "2024-01-01T00:00:00Z" },
                { id: 2, type: "follow", actor: "bo", created_at: "2024-01-01T00:00:00Z", read_at: "2024-01-02T00:00:00Z" },
                { id: 3, type: "diagram_reply", actor: "cy", diagram_project_id: "p", diagram_file_id: "f", read_at: "2024-01-02T00:00:00Z", created_at: "2024-01-01T00:00:00Z" },
              ]
            : [{ id: 4, type: "follow", actor: "di", created_at: "2024-01-01T00:00:00Z", read_at: "2024-01-02T00:00:00Z" }];
        return HttpResponse.json({ data: rows, meta: { page: Number(p), limit: 3, total: 4, has_more: p === "1", unread: 1 } });
      }),
    );
    const { user } = await renderRouted(<NotificationsPage />);
    await user.click(await screen.findByRole("button", { name: "Mark all as read" }));
    await waitFor(() => expect(marked).toBe(true));
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("di followed you")).toBeInTheDocument();
  });
});

import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { LibraryPage, NotificationsPage } from "./MePages";

const feed = (data: object[]) =>
  server.use(http.get(api("/me/notifications"), () => HttpResponse.json({ data, meta: { page: 1, limit: 20, total: data.length, unread: data.length } })));

describe("NotificationsPage", () => {
  it("lists diagram notifications next to the blog's, linking only the diagram ones to the comment thread", async () => {
    signIn();
    feed([
      { id: 1, type: "follow", actor: "ali", created_at: "2024-01-01T00:00:00Z" },
      {
        id: 2,
        type: "diagram_mention",
        actor: "bo",
        text: "bo mentioned you in Auth flow",
        diagram_project_id: "p1",
        diagram_file_id: "f1",
        diagram_comment_id: "9",
        created_at: "2024-01-01T00:00:00Z",
      },
      { id: 3, type: "diagram_reply", actor: "cy", diagram_project_id: "p1", diagram_file_id: "f2", created_at: "2024-01-01T00:00:00Z" },
    ]);
    await renderRouted(<NotificationsPage />, { path: "/me/notifications" });
    const items = await screen.findAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(within(items[0] as HTMLElement).getByText("ali followed you")).toBeInTheDocument();
    expect(within(items[0] as HTMLElement).queryByRole("link")).toBeNull(); // unchanged: plain row
    const mention = within(items[1] as HTMLElement).getByRole("link");
    expect(mention).toHaveTextContent("bo mentioned you in Auth flow");
    expect(mention.getAttribute("href")).toBe("/d/f/f1?comment=9");
    const reply = within(items[2] as HTMLElement).getByRole("link");
    expect(reply).toHaveTextContent("cy replied to your diagram comment");
    expect(reply.getAttribute("href")).toBe("/d/f/f2");
  });

  it("clicking an unread notification marks just that one read (dot goes at once, one POST)", async () => {
    signIn();
    const hits: string[] = [];
    const rows = () => [
      { id: 1, type: "follow", actor: "ali", created_at: "2024-01-01T00:00:00Z", ...(hits.includes("1") ? { read_at: "2024-01-02T00:00:00Z" } : {}) },
      { id: 2, type: "follow", actor: "bo", created_at: "2024-01-01T00:00:00Z" },
    ];
    server.use(
      http.post(api("/me/notifications/:id/read"), ({ params }) => (hits.push(String(params.id)), new HttpResponse(null, { status: 204 }))),
      http.get(api("/me/notifications"), () => HttpResponse.json({ data: rows(), meta: { page: 1, limit: 20, total: 2, unread: 2 - hits.length } })),
    );
    await renderRouted(<NotificationsPage />, { path: "/me/notifications" });
    const items = await screen.findAllByRole("listitem");
    fireEvent.click(within(items[0] as HTMLElement).getByRole("button", { name: /ali followed you/ }));
    await waitFor(() => expect(hits).toEqual(["1"]));
    await waitFor(() => expect(within(items[0] as HTMLElement).queryByText("Unread")).toBeNull());
    expect(within(items[1] as HTMLElement).getByText("Unread")).toBeInTheDocument();
  });
});

describe("LibraryPage", () => {
  it("lists saved diagrams under a Diagrams tab and leaves the Bookmarks tab as it was", async () => {
    signIn();
    const d = {
      file_id: "f1",
      slug: "checkout-1a2b3c4d",
      title: "Checkout flow",
      kind: "sdd",
      claps: 7,
      published_at: "2026-10-01T00:00:00Z",
      updated_at: "2026-10-02T00:00:00Z",
      author: { id: 1, username: "ali" },
    };
    server.use(
      http.get(api("/me/bookmarks"), () => page([])),
      http.get(api("/me/diagram-bookmarks"), () => page([d])),
    );
    const { user } = await renderRouted(<LibraryPage />);
    expect(await screen.findByText("Nothing saved.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Diagrams" }));
    const card = await screen.findByRole("link", { name: /Checkout flow/ });
    expect(card).toHaveAttribute("href", "/d/v/checkout-1a2b3c4d");
    expect(screen.getByLabelText("7 sparks")).toBeInTheDocument();
  });
});

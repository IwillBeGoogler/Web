import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { tokens } from "@/shared/api";
import { makePost, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { EditorPage } from "./EditorPage";

describe("EditorPage", () => {
  // these tests type into the Markdown textarea; the visual editor has its own tests
  beforeEach(() => localStorage.setItem("iwillbegoogler.editor.mode", "md"));

  it("publishes with topics and goes to the story", async () => {
    signIn();
    let sent: unknown;
    server.use(
      http.get(api("/me/publications"), () => HttpResponse.json({ data: [] })),
      http.post(api("/posts"), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ data: makePost({ id: 7, slug: "my-story", author: "admin", title: "My story" }) }, { status: 201 });
      }),
    );
    const { user, router } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Title"), "My story");
    await user.type(screen.getByLabelText("Story body (Markdown)"), "Once upon a time");
    await user.click(screen.getByRole("button", { name: "Ship it" }));
    const topic = await screen.findByLabelText("Add a topic");
    await user.type(topic, "Go{Enter}DevOps,");
    expect(screen.getByRole("button", { name: "Remove go" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ship now" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/@admin/my-story"));
    expect(sent).toEqual({
      title: "My story",
      subtitle: "",
      body: "Once upon a time",
      status: "published",
      cover_url: "",
      tags: ["go", "devops"],
      category_ids: [],
      publish_at: null,
      publication_id: 0,
    });
    tokens.set(null);
  });

  it("files the story under topics from the tree, the first picked is the main one", async () => {
    signIn();
    let sent: { category_ids?: number[] } = {};
    server.use(
      http.get(api("/me/publications"), () => HttpResponse.json({ data: [] })),
      http.get(api("/categories"), () =>
        HttpResponse.json({
          data: [
            { id: 1, parent_id: 0, slug: "sd", name: "System Design", names: {}, position: 0, count: 0 },
            { id: 2, parent_id: 1, slug: "cache", name: "Caching", names: {}, position: 0, count: 0 },
            { id: 3, parent_id: 2, slug: "cdn", name: "CDN", names: {}, position: 0, count: 0 },
          ],
        }),
      ),
      http.post(api("/posts"), async ({ request }) => {
        sent = (await request.json()) as typeof sent;
        return HttpResponse.json({ data: makePost({ id: 8, slug: "s", author: "admin", title: "S" }) }, { status: 201 });
      }),
    );
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Title"), "S");
    await user.type(screen.getByLabelText("Story body (Markdown)"), "text");
    await user.click(screen.getByRole("button", { name: "Ship it" }));
    await user.click(await screen.findByRole("button", { name: "System Design" }));
    await user.click(await screen.findByRole("checkbox", { name: "Caching" }));
    await user.click(screen.getByRole("checkbox", { name: "System Design" }));
    await user.click(screen.getByRole("checkbox", { name: "CDN" }));
    await user.click(screen.getByRole("checkbox", { name: "CDN" }));
    await user.click(screen.getByRole("button", { name: "Remove System Design" }));
    await user.click(screen.getByRole("button", { name: "Ship now" }));
    await waitFor(() => expect(sent.category_ids).toEqual([2]));
    tokens.set(null);
  });

  it("allows at most 5 topics from the tree and collapses a branch", async () => {
    signIn();
    const roots = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, parent_id: 0, slug: `r${i}`, name: `Root ${i}`, names: {}, position: i, count: 0 }));
    server.use(
      http.get(api("/me/publications"), () => HttpResponse.json({ data: [] })),
      http.get(api("/categories"), () => HttpResponse.json({ data: roots })),
    );
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Title"), "S");
    await user.type(screen.getByLabelText("Story body (Markdown)"), "text");
    await user.click(screen.getByRole("button", { name: "Ship it" }));
    for (let i = 0; i < 5; i++) await user.click(await screen.findByRole("checkbox", { name: `Root ${i}` }));
    expect(screen.getByRole("checkbox", { name: "Root 5" })).toBeDisabled();
    await user.click(screen.getByRole("checkbox", { name: "Root 5" }));
    expect(screen.getByRole("checkbox", { name: "Root 5" })).not.toBeChecked();
    const toggle = screen.getByRole("button", { name: "Root 0", expanded: false });
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    tokens.set(null);
  });

  it("keeps Ship it disabled until there is a title and a body", async () => {
    signIn();
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    expect(screen.getByRole("button", { name: "Ship it" })).toBeDisabled();
    await user.type(screen.getByLabelText("Title"), "T");
    expect(screen.getByRole("button", { name: "Ship it" })).toBeDisabled();
    await user.type(screen.getByLabelText("Story body (Markdown)"), "x");
    expect(screen.getByRole("button", { name: "Ship it" })).toBeEnabled();
    tokens.set(null);
  });
});

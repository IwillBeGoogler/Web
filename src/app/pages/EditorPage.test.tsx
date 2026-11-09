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
      publish_at: null,
      publication_id: 0,
    });
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

import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makePost } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { ArticlePage } from "./ArticlePage";

const profile = { id: 1, username: "ali", display_name: "Ali V", created_at: "x", is_following: false };

describe("ArticlePage", () => {
  it("renders the story, sanitizes HTML and counts a view", async () => {
    const view = vi.fn(() => new HttpResponse(null, { status: 204 }));
    server.use(
      http.get(api("/slug/hello-iblog"), () => HttpResponse.json({ data: makePost({ body_html: '<h2>Part</h2><img src=x onerror="alert(1)"><p>Body</p>' }) })),
      http.get(api("/users/ali"), () => HttpResponse.json({ data: profile })),
      http.get(api("/posts/1/related"), () => HttpResponse.json({ data: [] })),
      http.post(api("/posts/1/view"), view),
    );
    const { container } = await renderRouted(<ArticlePage slug="hello-iblog" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Hello iBlog" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Part" })).toBeInTheDocument();
    expect(container.innerHTML).not.toContain("onerror");
    expect(await screen.findByText("Ali V")).toBeInTheDocument();
    expect(screen.getAllByRole("toolbar", { name: "Post actions" })).toHaveLength(1);
    expect(screen.getByRole("heading", { name: "Discussion" })).toBeInTheDocument();
    await waitFor(() => expect(view).toHaveBeenCalled());
  });

  it("shows not found", async () => {
    server.use(http.get(api("/slug/nope"), () => HttpResponse.json({ status: 404, detail: "not found" }, { status: 404 })));
    await renderRouted(<ArticlePage slug="nope" />);
    expect(await screen.findByText("This story doesn't exist or was removed.")).toBeInTheDocument();
  });
});

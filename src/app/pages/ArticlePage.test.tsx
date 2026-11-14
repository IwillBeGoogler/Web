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
      http.get(api("/slug/hello-iwillbegoogler"), () =>
        HttpResponse.json({ data: makePost({ body_html: '<h2>Part</h2><img src=x onerror="alert(1)"><p>Body</p>' }) }),
      ),
      http.get(api("/users/ali"), () => HttpResponse.json({ data: profile })),
      http.get(api("/posts/1/related"), () => HttpResponse.json({ data: [] })),
      http.post(api("/posts/1/view"), view),
    );
    const { container } = await renderRouted(<ArticlePage slug="hello-iwillbegoogler" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Hello IWillBeGoogler" })).toBeInTheDocument();
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

  it("underlines glossary terms: the article's own win over site-wide ones, in the reader's language", async () => {
    let lang: string | null = null;
    server.use(
      http.get(api("/slug/hello-iwillbegoogler"), () =>
        HttpResponse.json({
          data: makePost({
            body_html: "<p>A Pod runs on a Node.</p>",
            glossary: [{ term: "Pod", aliases: [], definition: "from the article" }],
          }),
        }),
      ),
      http.get(api("/glossary"), ({ request }) => {
        lang = new URL(request.url).searchParams.get("lang");
        return HttpResponse.json({
          data: [
            { id: 1, term: "pod", aliases: [], definition: "site pod", lang: "" },
            { id: 2, term: "Node", aliases: [], definition: "site node", lang: "" },
          ],
        });
      }),
      http.get(api("/users/ali"), () => HttpResponse.json({ data: profile })),
      http.get(api("/posts/1/related"), () => HttpResponse.json({ data: [] })),
      http.post(api("/posts/1/view"), () => new HttpResponse(null, { status: 204 })),
    );
    const { container } = await renderRouted(<ArticlePage slug="hello-iwillbegoogler" />);
    await waitFor(() => expect(container.querySelectorAll(".glossary-term")).toHaveLength(2));
    expect([...container.querySelectorAll(".glossary-term")].map((e) => (e as HTMLElement).dataset.termId)).toEqual(["a:0", "g:2"]);
    expect(lang).toMatch(/^(uz|ru|en)$/);
  });
});

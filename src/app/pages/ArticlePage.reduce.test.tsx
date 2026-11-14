import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { makePost } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { ArticlePage } from "./ArticlePage";

vi.mock("@/contexts/collections/ui/Highlights", () => ({ Highlighter: () => null, HighlightsPanel: () => null }));
vi.mock("@/contexts/collections/ui/Lists", () => ({ SaveToList: () => null }));
vi.mock("@/contexts/collections/ui/Series", () => ({ SeriesNav: () => null }));

describe("ArticlePage with reduced motion", () => {
  it("renders the story without entrance animations", async () => {
    vi.stubGlobal("matchMedia", (q: string) => ({
      matches: q.includes("prefers-reduced-motion"),
      media: q,
      onchange: null,
      addEventListener() {},
      removeEventListener() {},
      addListener() {},
      removeListener() {},
      dispatchEvent: () => false,
    }));
    server.use(
      http.get(api("/slug/calm"), () => HttpResponse.json({ data: makePost({ slug: "calm", title: "Calm" }) })),
      http.get(api("/users/:u"), () =>
        HttpResponse.json({ data: { id: 1, username: "ali", display_name: "Ali", bio: "", followers: 0, created_at: "x", is_following: false } }),
      ),
      http.get(api("/posts/:id/related"), () => HttpResponse.json({ data: [] })),
      http.post(api("/posts/:id/view"), () => new HttpResponse(null, { status: 204 })),
      http.post(api("/posts/:id/read"), () => new HttpResponse(null, { status: 204 })),
    );
    await renderRouted(<ArticlePage slug="calm" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Calm" })).toBeInTheDocument();
    vi.unstubAllGlobals();
  });
});

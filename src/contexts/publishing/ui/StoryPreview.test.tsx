import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { testQueryClient } from "@/test/render";
import { api, server } from "@/test/server";
import { StoryPreview } from "./StoryPreview";

const ui = (body: string, glossary?: { term: string; aliases: string[]; definition: string }[]) => (
  <QueryClientProvider client={testQueryClient()}>
    <StoryPreview body={body} glossary={glossary} />
  </QueryClientProvider>
);

describe("StoryPreview", () => {
  it("shows the empty hint for a blank body without calling the server", () => {
    render(ui("   "));
    expect(screen.getByRole("region", { name: "Preview" })).toHaveAttribute("aria-busy", "false");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("renders the sanitized server HTML after the debounce", async () => {
    server.use(http.post(api("/posts/preview"), () => HttpResponse.json({ data: { body_html: "<p>Rendered <script>x()</script>text</p>" } })));
    render(ui("hello"));
    expect(await screen.findByText(/Rendered/, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(document.querySelector("script")).toBeNull();
  });

  it("shows an alert when the preview request fails", async () => {
    server.use(http.post(api("/posts/preview"), () => HttpResponse.json({ status: 500, detail: "x" }, { status: 500 })));
    render(ui("hello"));
    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument(), { timeout: 3000 });
  });

  it("underlines the story's own and the site's glossary terms", async () => {
    server.use(
      http.post(api("/posts/preview"), () => HttpResponse.json({ data: { body_html: "<p>A cache with a TTL.</p>" } })),
      http.get(api("/glossary"), () => HttpResponse.json({ data: [{ id: 1, term: "Cache", aliases: [], definition: "Fast store", lang: "" }] })),
    );
    render(ui("hello", [{ term: "TTL", aliases: [], definition: "Time to live" }]));
    await waitFor(() => expect(document.querySelectorAll(".glossary-term")).toHaveLength(2), { timeout: 3000 });
    expect([...document.querySelectorAll(".glossary-term")].map((e) => e.textContent)).toEqual(["cache", "TTL"]);
  });
});

import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { makePost, page } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { Feed } from "./Feed";

describe("Feed", () => {
  it("renders cards with iBlog-style meta and links", async () => {
    server.use(http.get(api("/posts"), () => page([makePost({ claps: 1200 })])));
    await renderRouted(<Feed source={{ kind: "latest" }} />);
    const title = await screen.findByRole("heading", { name: "Hello iBlog" });
    expect(title.closest("a")).toHaveAttribute("href", "/@ali/hello-iblog");
    expect(screen.getAllByText("3 min").length).toBeGreaterThan(0);
    expect(screen.getByText("1.2K")).toBeInTheDocument();
    for (const a of screen.getAllByRole("link", { name: "@ali" })) expect(a).toHaveAttribute("href", "/@ali");
  });
  it("loads more pages", async () => {
    server.use(
      http.get(api("/posts"), ({ request }) =>
        new URL(request.url).searchParams.get("cursor")
          ? page([makePost({ id: 2, title: "Second", slug: "s" })])
          : page([makePost()], { has_more: true, next_cursor: "c2" }),
      ),
    );
    const { user } = await renderRouted(<Feed source={{ kind: "latest" }} />);
    await user.click(await screen.findByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Second")).toBeInTheDocument();
  });
  it("shows the empty state and errors", async () => {
    server.use(http.get(api("/me/feed"), () => page([])));
    await renderRouted(<Feed source={{ kind: "following" }} empty={{ title: "Your circle is quiet." }} />);
    expect(await screen.findByText("Your circle is quiet.")).toBeInTheDocument();
  });
  it("offers a retry on failure", async () => {
    server.use(http.get(api("/posts"), () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    await renderRouted(<Feed source={{ kind: "latest" }} />);
    expect(await screen.findByRole("button", { name: "Try again" })).toBeInTheDocument();
  });
});

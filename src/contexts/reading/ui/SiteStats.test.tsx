import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { SiteStats } from "./SiteStats";

describe("SiteStats", () => {
  it("shows totals and the most viewed stories and diagrams", async () => {
    server.use(
      http.get(api("/stats/site"), () =>
        HttpResponse.json({
          data: {
            totals: { post_views: 1500, diagram_views: 42, visitors: 7, posts: 3, diagrams: 1, users: 2 },
            top_posts: [{ id: 1, slug: "cache", title: "Caching 101", author: "ali", views: 900 }],
            top_diagrams: [{ slug: "queue", title: "Queue design", author: "vali", views: 40 }],
          },
        }),
      ),
    );
    await renderRouted(<SiteStats />);
    expect(await screen.findByText("Caching 101")).toHaveAttribute("href", "/@ali/cache");
    expect(screen.getByText("Queue design")).toBeInTheDocument();
    expect(screen.getByText("1.5K")).toBeInTheDocument();
  });

  it("renders nothing when the request fails", async () => {
    server.use(http.get(api("/stats/site"), () => HttpResponse.json({ title: "down" }, { status: 500 })));
    const { container } = await renderRouted(<SiteStats />);
    expect(container.querySelector("#site-stats")).toBeNull();
  });
});

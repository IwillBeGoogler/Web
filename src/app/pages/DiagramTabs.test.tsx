import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { page } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { ProfilePage } from "./ProfilePage";
import { SearchPage } from "./SearchPage";

const d = {
  file_id: "f1",
  slug: "checkout-1a2b3c4d",
  title: "Checkout flow",
  description: "",
  tags: [],
  visibility: "public",
  kind: "uml",
  page_count: 1,
  thumbnail_url: null,
  published_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  author: { id: 1, username: "ali", display_name: "Ali V", avatar_url: "" },
};

describe("profile Diagrams tab", () => {
  it("keeps the existing tabs and adds Diagrams, which lists the user's public diagrams", async () => {
    server.use(
      http.get(api("/users/ali"), () =>
        HttpResponse.json({
          data: {
            id: 1,
            username: "ali",
            display_name: "Ali V",
            bio: "",
            avatar_url: "",
            created_at: "2026-01-01T00:00:00Z",
            posts: 0,
            followers: 0,
            following: 0,
            is_following: false,
          },
        }),
      ),
      http.get(api("/users/ali/posts"), () => page([])),
      http.get(api("/users/ali/diagrams"), () => page([d])),
    );
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    const group = await screen.findByRole("radiogroup", { name: "Profile section" });
    expect(Array.from(group.querySelectorAll("[role=radio]")).map((b) => b.textContent?.replace(/^\d+/, ""))).toEqual([
      "Writing",
      "Lists",
      "Series",
      "Diagrams",
    ]);
    await user.click(screen.getByRole("radio", { name: /Diagrams/ }));
    expect(await screen.findByRole("link", { name: /Checkout flow/ })).toHaveAttribute("href", "/d/v/checkout-1a2b3c4d");
  });
});

describe("search Diagrams section", () => {
  it("shows stories first and diagrams on demand, using /diagrams/public?q=", async () => {
    let q: string | null = null;
    server.use(
      http.get(api("/posts"), () => page([])),
      http.get(api("/diagrams/public"), ({ request }) => {
        q = new URL(request.url).searchParams.get("q");
        return page([d]);
      }),
    );
    const { user } = await renderRouted(<SearchPage q="checkout" />, { path: "/search" });
    expect(screen.getByRole("radio", { name: /Stories/ })).toHaveAttribute("aria-checked", "true");
    await user.click(screen.getByRole("radio", { name: /Diagrams/ }));
    expect(await screen.findByRole("link", { name: /Checkout flow/ })).toBeInTheDocument();
    expect(q).toBe("checkout");
  });
});

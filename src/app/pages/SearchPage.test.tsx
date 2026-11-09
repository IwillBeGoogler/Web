import { screen, waitFor } from "@testing-library/react";
import { http } from "msw";
import { describe, expect, it } from "vitest";
import { page } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { SearchPage } from "./SearchPage";

describe("SearchPage", () => {
  it("empty q: prompt, submit navigates and syncs field", async () => {
    server.use(
      http.get(api("/posts"), () => page([])),
      http.get(api("/diagrams/public"), () => page([])),
    );
    const { user, router } = await renderRouted(<SearchPage q="" />, { path: "/search" });
    expect(screen.getByText("Search stories by title or text.")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Search"), "  hello ");
    await user.click(screen.getByRole("button", { name: "Search" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ q: "hello" }));
  });

  it("with q: results heading, empty stories and empty diagrams", async () => {
    server.use(
      http.get(api("/posts"), () => page([])),
      http.get(api("/diagrams/public"), () => page([])),
    );
    const { user } = await renderRouted(<SearchPage q="zzz" />, { path: "/search" });
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Results for zzz");
    expect(await screen.findByText("No stories found.")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: /Diagrams/ }));
    expect(await screen.findByText("No diagrams found.")).toBeInTheDocument();
  });
});

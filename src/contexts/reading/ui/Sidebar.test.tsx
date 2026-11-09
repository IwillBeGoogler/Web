import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { tokens } from "@/shared/api";
import { makePost, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { Sidebar } from "./Sidebar";

afterEach(() => tokens.set(null));

const ok = (data: unknown) => HttpResponse.json({ data });
const err = () => HttpResponse.json({ error: { message: "x" } }, { status: 500 });

describe("Sidebar", () => {
  it("shows loading skeletons then trending, topics and footer links", async () => {
    server.use(
      http.get(api("/posts/trending"), () => ok([makePost({ id: 1, title: "Hot one" }), makePost({ id: 2, title: "Hot two" })])),
      http.get(api("/tags"), () => ok([{ name: "go", count: 2 }, { name: "rust", count: 9 }])),
    );
    await renderRouted(<Sidebar />);
    expect(await screen.findByText("Hot one")).toBeInTheDocument();
    expect(screen.getByText("Hot two")).toBeInTheDocument();
    expect(await screen.findByText("rust")).toBeInTheDocument();
    expect(screen.queryByText("Writers to watch")).toBeNull();
    expect(screen.getByRole("link", { name: "Privacy" })).toBeInTheDocument();
  });

  it("shows empty state", async () => {
    server.use(http.get(api("/posts/trending"), () => ok([])), http.get(api("/tags"), () => ok([])));
    await renderRouted(<Sidebar />);
    expect(await screen.findByText("No signal yet.")).toBeInTheDocument();
  });

  it("shows retry on errors and refetches", async () => {
    let fail = true;
    server.use(
      http.get(api("/posts/trending"), () => (fail ? err() : ok([makePost({ title: "Back" })]))),
      http.get(api("/tags"), () => (fail ? err() : ok([{ name: "go", count: 1 }]))),
    );
    const { user } = await renderRouted(<Sidebar />);
    const retries = await screen.findAllByRole("button", { name: "Retry" }, { timeout: 5000 });
    expect(retries).toHaveLength(2);
    fail = false;
    for (const r of retries) await user.click(r);
    expect(await screen.findByText("Back")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Retry" })).toBeNull());
  });

  it("lists writers to watch when signed in", async () => {
    signIn();
    server.use(
      http.get(api("/posts/trending"), () => ok([])),
      http.get(api("/tags"), () => ok([])),
      http.get(api("/me/suggestions/users"), () => ok([{ id: 7, username: "vali", display_name: "Vali D", avatar_url: "", followers: 1200 }])),
    );
    await renderRouted(<Sidebar />);
    expect(await screen.findByText("Writers to watch")).toBeInTheDocument();
    expect(screen.getByText(/@vali/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Track vali" })).toBeInTheDocument();
  });
});

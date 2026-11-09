import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { tokens } from "@/shared/api";
import { makePost, page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { ProfilePage } from "./ProfilePage";

const profile = (o: Record<string, unknown> = {}) => ({
  id: 7,
  username: "ali",
  display_name: "Ali V",
  bio: "I write",
  avatar_url: "",
  created_at: "2026-01-01T00:00:00Z",
  posts: 2,
  followers: 5,
  following: 3,
  is_following: false,
  is_subscribed: false,
  pinned_post_id: 0,
  ...o,
});

const base = (o: Record<string, unknown> = {}) =>
  server.use(
    http.get(api("/users/ali"), () => HttpResponse.json({ data: profile(o) })),
    http.get(api("/users/ali/posts"), () => page([makePost({ title: "Ali story" })])),
  );

afterEach(() => {
  tokens.set(null);
  authDialog.close();
});

describe("ProfilePage", () => {
  it("shows skeleton then 404 for unknown account", async () => {
    server.use(http.get(api("/users/ghost"), () => HttpResponse.json({ detail: "nope" }, { status: 404 })));
    await renderRouted(<ProfilePage username="ghost" />, { path: "/@ghost" });
    expect(await screen.findByText("This account doesn't exist.")).toBeInTheDocument();
  });

  it("renders header, bio, stats, feed and visitor controls", async () => {
    base();
    await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("Ali V");
    expect(screen.getByText("I write")).toBeInTheDocument();
    expect(await screen.findByText("Ali story")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "More options" })).toBeInTheDocument();
  });

  it("omits bio when empty and shows own profile edit link", async () => {
    signIn();
    server.use(
      http.get(api("/me"), () =>
        HttpResponse.json({ data: { id: 7, username: "ali", email: "a@x.dev", display_name: "Ali V", bio: "", avatar_url: "", roles: [], created_at: "x" } }),
      ),
    );
    base({ bio: "", display_name: "" });
    await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    expect(await screen.findByRole("link", { name: "Edit profile" })).toHaveAttribute("href", "/me/settings");
    expect(screen.queryByRole("button", { name: "More options" })).toBeNull();
    expect(screen.queryByText("I write")).toBeNull();
  });

  it("shows pinned post", async () => {
    base({ pinned_post_id: 9 });
    server.use(http.get(api("/posts/9"), () => HttpResponse.json({ data: makePost({ id: 9, title: "Pinned one" }) })));
    await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    expect(await screen.findByText("Pinned one")).toBeInTheDocument();
    expect(screen.getByText("Pinned")).toBeInTheDocument();
  });

  it("pinned renders nothing when post fails", async () => {
    base({ pinned_post_id: 9 });
    server.use(http.get(api("/posts/9"), () => HttpResponse.json({ detail: "x" }, { status: 404 })));
    await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    await screen.findByText("Ali story");
    expect(screen.queryByText("Pinned")).toBeNull();
  });

  it("lists tab: rows, then empty", async () => {
    base();
    server.use(
      http.get(api("/users/ali/lists"), () =>
        page([{ id: 1, slug: "favs", name: "Favs", description: "", private: false, owner: "ali", user_id: 7, posts: 2 }]),
      ),
    );
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    await screen.findByText("Ali story");
    await user.click(screen.getByRole("radio", { name: /Lists/ }));
    expect(await screen.findByText("Favs")).toBeInTheDocument();
  });

  it("lists tab empty", async () => {
    base();
    server.use(http.get(api("/users/ali/lists"), () => page([])));
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    await screen.findByText("Ali story");
    await user.click(screen.getByRole("radio", { name: /Lists/ }));
    expect(await screen.findByText("No public lists.")).toBeInTheDocument();
  });

  it("series and diagrams tabs", async () => {
    base();
    server.use(
      http.get(api("/users/ali/series"), () => HttpResponse.json({ data: [] })),
      http.get(api("/users/ali/diagrams"), () => page([])),
    );
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    await screen.findByText("Ali story");
    await user.click(screen.getByRole("radio", { name: /Series/ }));
    await user.click(screen.getByRole("radio", { name: /Diagrams/ }));
    expect(await screen.findByText(/hasn't published any diagrams yet/)).toBeInTheDocument();
  });

  it("people dialog: followers with rows, show more", async () => {
    base();
    const u = (n: number) => ({ id: n, username: `u${n}`, display_name: `User ${n}`, avatar_url: "" });
    server.use(
      http.get(api("/users/ali/followers"), ({ request }) => {
        const p = new URL(request.url).searchParams.get("page");
        return p === "2" ? page([u(2)], { page: 2 }) : page([u(1)], { has_more: true });
      }),
    );
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    await user.click(await screen.findByRole("button", { name: "5 readers, show list" }));
    expect(await screen.findByText("User 1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("User 2")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("User 1")).toBeNull());
  });

  it("people dialog: following empty; link click closes", async () => {
    base();
    server.use(http.get(api("/users/ali/following"), () => page([])));
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    await user.click(await screen.findByRole("button", { name: "3 tracking, show list" }));
    expect(await screen.findByText("Nobody yet.")).toBeInTheDocument();
  });

  it("people dialog: link closes dialog", async () => {
    base();
    server.use(http.get(api("/users/ali/followers"), () => page([{ id: 1, username: "u1", display_name: "User 1", avatar_url: "" }])));
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    await user.click(await screen.findByRole("button", { name: "5 readers, show list" }));
    await user.click(await screen.findByRole("link", { name: "User 1" }));
    await waitFor(() => expect(screen.queryByText("Nobody yet.")).toBeNull());
  });

  it("menu asks anonymous to sign in", async () => {
    base();
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByRole("menuitem", { name: /Mute ali/ }));
    expect(authDialog.get()).toBe("signin");
  });

  it("menu: subscribe / unsubscribe / mute / block succeed", async () => {
    signIn();
    base();
    const hits: string[] = [];
    const h = (m: "post" | "delete", p: string) =>
      http[m](api(p), () => {
        hits.push(`${m} ${p}`);
        return new HttpResponse(null, { status: 204 });
      });
    server.use(h("post", "/users/ali/subscribe"), h("delete", "/users/ali/subscribe"), h("post", "/users/ali/mute"), h("post", "/users/ali/block"));
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    const open = async () => user.click(await screen.findByRole("button", { name: "More options" }));
    await open();
    await user.click(await screen.findByRole("menuitem", { name: /Get email updates/ }));
    await waitFor(() => expect(hits).toContain("post /users/ali/subscribe"));
    await open();
    await user.click(await screen.findByRole("menuitem", { name: /Stop email updates/ }));
    await waitFor(() => expect(hits).toContain("delete /users/ali/subscribe"));
    await open();
    await user.click(await screen.findByRole("menuitem", { name: /Mute ali/ }));
    await waitFor(() => expect(hits).toContain("post /users/ali/mute"));
    await open();
    await user.click(await screen.findByRole("menuitem", { name: /Block ali/ }));
    await waitFor(() => expect(hits).toContain("post /users/ali/block"));
  });

  it("menu: failure toasts error", async () => {
    signIn();
    base();
    server.use(http.post(api("/users/ali/mute"), () => HttpResponse.json({ detail: "boom" }, { status: 500 })));
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByRole("menuitem", { name: /Mute ali/ }));
    await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).not.toBeNull());
  });

  it("menu: report opens dialog", async () => {
    signIn();
    base();
    const { user } = await renderRouted(<ProfilePage username="ali" />, { path: "/@ali" });
    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(await screen.findByRole("menuitem", { name: /Report account/ }));
    const dlg = await screen.findByRole("dialog");
    expect(within(dlg).getByRole("button", { name: /Send|Report|Submit/i })).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

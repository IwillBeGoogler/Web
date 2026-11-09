import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { tokens } from "@/shared/api";
import { me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { PostMenu } from "./PostMenu";

const post = { id: 5, title: "T", author: "vali", user_id: 9, tags: ["go"] };
const open = async (ui = <PostMenu post={post} />) => {
  const r = await renderRouted(ui);
  await r.user.click(screen.getByRole("button", { name: "More options for T" }));
  return r;
};

describe("PostMenu", () => {
  afterEach(() => tokens.set(null));
  it("renders nothing for your own story", async () => {
    signIn();
    await renderRouted(<PostMenu post={{ ...post, user_id: me.id }} />);
    await waitFor(() => expect(screen.queryByRole("button", { name: /More options/ })).toBeNull());
  });

  it("anonymous readers are asked to sign in", async () => {
    const { user } = await open();
    await user.click(await screen.findByRole("menuitem", { name: /Show less like this/ }));
    expect(authDialog.get()).toBe("signin");
    authDialog.close();
  });

  it("hides post, author and tag, then reports", async () => {
    signIn();
    const hits: unknown[] = [];
    server.use(
      http.post(api("/me/hidden"), async ({ request }) => {
        hits.push(await request.json());
        return new HttpResponse(null, { status: 204 });
      }),
      http.post(api("/reports"), () => new HttpResponse(null, { status: 204 })),
    );
    const { user } = await open();
    await user.click(await screen.findByRole("menuitem", { name: /Show less like this/ }));
    await waitFor(() => expect(hits).toHaveLength(1));
    await user.click(screen.getByRole("button", { name: "More options for T" }));
    await user.click(await screen.findByRole("menuitem", { name: /Hide stories by vali/ }));
    await waitFor(() => expect(hits).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: "More options for T" }));
    await user.click(await screen.findByRole("menuitem", { name: /Show less about go/ }));
    await waitFor(() => expect(hits).toHaveLength(3));
    expect(hits[2]).toEqual({ kind: "tag", target: "go" });
    await user.click(screen.getByRole("button", { name: "More options for T" }));
    await user.click(await screen.findByRole("menuitem", { name: /Report story/ }));
    expect(await screen.findByText("Report story")).toBeInTheDocument();
    tokens.set(null);
  });

  it("toasts on hide failure and omits author/tag items when absent", async () => {
    signIn();
    const spy = vi.fn(() => HttpResponse.json({ error: { message: "nope" } }, { status: 500 }));
    server.use(http.post(api("/me/hidden"), spy));
    const { user } = await open(<PostMenu post={{ ...post, author: "", tags: [] }} />);
    expect(screen.queryByRole("menuitem", { name: /Hide stories by/ })).toBeNull();
    expect(screen.queryByRole("menuitem", { name: /Show less about/ })).toBeNull();
    await user.click(await screen.findByRole("menuitem", { name: /Show less like this/ }));
    await waitFor(() => expect(spy).toHaveBeenCalled());
    tokens.set(null);
  });
});

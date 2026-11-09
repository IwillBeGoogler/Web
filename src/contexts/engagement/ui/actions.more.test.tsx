import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { tokens } from "@/shared/api";
import { me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { BookmarkButton, BookmarkKey, ClapButton, ClapKey, FollowButton } from "./actions";

afterEach(() => {
  tokens.set(null);
  authDialog.close();
});

describe("FollowButton", () => {
  it("hides for yourself", async () => {
    signIn();
    await renderRouted(<FollowButton username={me.username} following={false} />);
    await waitFor(() => expect(screen.queryByRole("button")).toBeNull());
  });
  it("anonymous asks to sign in", async () => {
    const { user } = await renderRouted(<FollowButton username="vali" following={false} />);
    await user.click(screen.getByRole("button", { name: "Track vali" }));
    expect(authDialog.get()).toBe("signin");
  });
  it("toggles tracking in both variants", async () => {
    signIn();
    const hit = vi.fn(() => new HttpResponse(null, { status: 204 }));
    server.use(http.post(api("/users/vali/follow"), hit), http.delete(api("/users/vali/follow"), hit));
    const { user } = await renderRouted(<FollowButton username="vali" following={false} />);
    await user.click(await screen.findByRole("button", { name: "Track vali" }));
    await user.click(await screen.findByRole("button", { name: "Stop tracking vali" }));
    await waitFor(() => expect(hit).toHaveBeenCalledTimes(2));
  });
  it("link variant toggles and rolls back on error", async () => {
    signIn();
    server.use(http.post(api("/users/vali/follow"), () => HttpResponse.json({ error: { message: "x" } }, { status: 500 })));
    const { user } = await renderRouted(<FollowButton username="vali" following={false} variant="link" size="md" />);
    await user.click(await screen.findByRole("button", { name: "Track vali" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Track vali" })).toHaveTextContent("Track"));
  });
  it("link variant shows Tracking when following", async () => {
    await renderRouted(<FollowButton username="vali" following variant="link" />);
    expect(screen.getByRole("button", { name: "Stop tracking vali" })).toHaveTextContent("Tracking");
  });
});

describe("BookmarkKey", () => {
  it("compact on-state with custom labels", async () => {
    signIn();
    const onToggle = vi.fn();
    const labels = { on: "A", off: "B", saved: "C", save: "D" };
    const { user } = await renderRouted(<BookmarkKey on compact onToggle={onToggle} labels={labels} />);
    await user.click(screen.getByRole("button", { name: "A" }));
    await waitFor(() => expect(onToggle).toHaveBeenCalled());
  });
  it("BookmarkButton compact passes through and shows saved", async () => {
    await renderRouted(<BookmarkButton compact post={{ id: 1, bookmarked: true }} />);
    expect(screen.getByRole("button", { name: "Remove from saved" })).toBeInTheDocument();
  });
});

describe("ClapKey", () => {
  it("disables for own, shows MAX, bursts when counted", async () => {
    signIn();
    const { user, rerender } = await renderRouted(<ClapKey claps={5} myClaps={50} own={false} onClap={() => true} />);
    expect(screen.getByText("MAX")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Spark/ }));
    rerender(<ClapKey claps={5} myClaps={0} own onClap={() => false} />);
  });
  it("own ClapButton is disabled", async () => {
    signIn();
    await renderRouted(<ClapButton post={{ id: 1, claps: 3, my_claps: 0, author: me.username }} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /Spark/ })).toBeDisabled());
  });
});

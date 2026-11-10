import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";

type Props = Record<string, unknown>;
const editor = vi.fn<(p: Props) => void>();
vi.mock("@diagram-editor", () => ({
  hasUnsavedChanges: () => false,
  flushPendingSaves: () => {},
  confirmLeave: async () => true,
  DiagramEditor: (p: Props) => {
    editor(p);
    return <div data-testid="editor" />;
  },
}));

const { EditorHost } = await import("./EditorHost");
const last = () => editor.mock.calls.at(-1)?.[0] as Props & Record<string, (...a: never[]) => unknown>;

beforeEach(() => editor.mockClear());

describe("EditorHost extras", () => {
  it("maps every editor target to a route and ignores login", async () => {
    signIn();
    const { router } = await renderRouted(<EditorHost fileId="f1" />, { path: "/d/f/f1" });
    await screen.findByTestId("editor");
    const nav = last().onNavigate as unknown as (t: unknown, o: { replace: boolean }) => void;
    nav({ to: "login" }, { replace: false });
    expect(router.state.location.pathname).toBe("/d/f/f1");
    nav({ to: "project", projectId: "p9" }, { replace: true });
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/p/p9"));
    nav({ to: "file" }, { replace: false });
    await waitFor(() => expect(router.state.location.pathname).toBe("/d"));
    nav({ to: "project" }, { replace: false });
    tokens.set(null);
  });

  it("ignores a second 401 while refreshing, and a successful refresh does not ask to sign in", async () => {
    signIn();
    await renderRouted(<EditorHost fileId="f1" />, { path: "/d/f/f1" });
    await screen.findByTestId("editor");
    let calls = 0;
    server.use(
      http.get(api("/me"), () => {
        calls++;
        return HttpResponse.json({
          data: { id: 3, username: "a", email: "", display_name: "A", bio: "", avatar_url: "", roles: [], created_at: "2026-01-01T00:00:00Z" },
        });
      }),
    );
    const un = last().onUnauthorized as unknown as () => void;
    un();
    un();
    await waitFor(() => expect(calls).toBeGreaterThan(0));
    expect(calls).toBe(1);
    tokens.set(null);
  });

  it("gives auth headers from the session, none for share links or without a token; owner-only publish action", async () => {
    signIn();
    await renderRouted(<EditorHost fileId="f1" commentId="c1" />, { path: "/d/f/f1" });
    await screen.findByTestId("editor");
    const p = last();
    expect((p.getAuthHeaders as unknown as () => Record<string, string>)().Authorization).toMatch(/^Bearer /);
    expect(p.commentId).toBe("c1");
    const actions = p.hostActions as unknown as (c: { fileId: string; role: string }) => unknown;
    expect(actions({ fileId: "f1", role: "editor" })).toBeNull();
    expect(actions({ fileId: "f1", role: "owner" })).not.toBeNull();
    tokens.set(null);
  });

  it("share link with a stale session sends no auth headers", async () => {
    signIn();
    await renderRouted(<EditorHost shareToken="tok" />, { path: "/d/s/tok" });
    await screen.findByTestId("editor");
    const s = last();
    expect((s.getAuthHeaders as unknown as () => unknown)()).toEqual({});
    expect((s.shareUrl as unknown as (t: string) => string)("abc")).toBe(`${window.location.origin}/d/s/abc`);
    expect(s.shareToken).toBe("tok");
    tokens.set(null);
  });

  it("works for a share link without any session", async () => {
    tokens.set(null);
    await renderRouted(<EditorHost shareToken="tok" />, { path: "/d/s/tok" });
    await screen.findByTestId("editor");
    expect((last().getAuthHeaders as unknown as () => unknown)()).toEqual({});
  });

  it("opens without a file or token props", async () => {
    signIn();
    await renderRouted(<EditorHost />, { path: "/d" });
    await screen.findByTestId("editor");
    expect(last().fileId).toBeUndefined();
    tokens.set(null);
  });
});

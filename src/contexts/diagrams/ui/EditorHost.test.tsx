import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";

type Props = Record<string, unknown>;
const editor = vi.fn<(p: Props) => void>();
const unsaved = { dirty: false, answer: true, asked: 0, flushed: 0 };
vi.mock("@diagram-editor", () => ({
  hasUnsavedChanges: () => unsaved.dirty,
  flushPendingSaves: () => {
    unsaved.flushed++;
  },
  confirmLeave: async () => {
    unsaved.asked++;
    return unsaved.answer;
  },
  DiagramEditor: (p: Props) => {
    editor(p);
    return <div data-testid="editor" />;
  },
}));

const { EditorHost } = await import("./EditorHost");

beforeEach(() => {
  editor.mockClear();
  Object.assign(unsaved, { dirty: false, answer: true, asked: 0, flushed: 0 });
});

describe("EditorHost", () => {
  it("asks to sign in instead of loading the editor when there is no session", async () => {
    await renderRouted(<EditorHost fileId="f1" />, { path: "/d/f/f1" });
    expect(screen.getByText("Sign in to open diagrams.")).toBeInTheDocument();
    expect(editor).not.toHaveBeenCalled();
  });

  it("mounts the editor with the page's session, theme and identity", async () => {
    signIn();
    await renderRouted(<EditorHost fileId="f1" />, { path: "/d/f/f1" });
    expect(await screen.findByTestId("editor")).toBeInTheDocument();
    await waitFor(() => expect(editor).toHaveBeenCalled());
    const p = editor.mock.calls.at(-1)?.[0] as Props;
    expect(p.fileId).toBe("f1");
    expect(p.theme).toBe("light");
    expect(p.user).toEqual({ id: "3", name: "Admin", email: "a@x.dev" });
    expect((p.getAuthHeaders as () => unknown)()).toEqual({ Authorization: "Bearer t" });
    tokens.set(null);
  });

  it("gives the editor a ticket minter (a new single-use ticket per call), but not for share links", async () => {
    let n = 0;
    server.use(http.post(api("/me/stream-ticket"), () => HttpResponse.json({ data: { ticket: `tk${++n}`, expires_in: 30 } })));
    signIn();
    await renderRouted(<EditorHost fileId="f1" />, { path: "/d/f/f1" });
    await screen.findByTestId("editor");
    const getTicket = ((editor.mock.calls.at(-1)?.[0] ?? {}) as Props).getTicket as () => Promise<string>;
    expect(await getTicket()).toBe("tk1");
    expect(await getTicket()).toBe("tk2");
    tokens.set(null);
    editor.mockClear();
    await renderRouted(<EditorHost shareToken="abc" />, { path: "/d/s/abc" });
    await screen.findByTestId("editor");
    expect("getTicket" in ((editor.mock.calls.at(-1)?.[0] ?? {}) as Props)).toBe(false);
  });

  it("passes the comment to open (a notification link) on to the editor", async () => {
    signIn();
    await renderRouted(<EditorHost fileId="f1" commentId="9" />, { path: "/d/f/f1" });
    await screen.findByTestId("editor");
    const last = (): Props => editor.mock.calls.at(-1)?.[0] ?? {};
    expect(last().commentId).toBe("9");
    editor.mockClear();
    await renderRouted(<EditorHost fileId="f1" />, { path: "/d/f/f1" });
    await waitFor(() => expect(editor).toHaveBeenCalled());
    expect("commentId" in last()).toBe(false);
    tokens.set(null);
  });

  it("opens a share link without an account", async () => {
    await renderRouted(<EditorHost shareToken="abc" />, { path: "/d/s/abc" });
    expect(await screen.findByTestId("editor")).toBeInTheDocument();
    const p = editor.mock.calls.at(-1)?.[0] as Props;
    expect(p.shareToken).toBe("abc");
    expect(p.fileId).toBeUndefined();
    expect((p.getAuthHeaders as () => unknown)()).toEqual({}); // the link is the credential
    expect((p.shareUrl as (t: string) => string)("tok")).toBe(`${window.location.origin}/d/s/tok`);
  });

  it("maps editor navigation to routes", async () => {
    signIn();
    const { router } = await renderRouted(<EditorHost fileId="f1" />, { path: "/d/f/f1" });
    await screen.findByTestId("editor");
    const onNavigate = (editor.mock.calls.at(-1)?.[0] as Props | undefined)?.onNavigate as (t: unknown, o: { replace: boolean }) => void;
    onNavigate({ to: "home" }, { replace: false });
    await waitFor(() => expect(router.state.location.pathname).toBe("/d"));
    onNavigate({ to: "file", projectId: "p", fileId: "f2" }, { replace: false });
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/f/f2"));
    tokens.set(null);
  });

  it("refreshes the session on a 401 from the editor, and asks to sign in only if that fails", async () => {
    signIn();
    await renderRouted(<EditorHost fileId="f1" />, { path: "/d/f/f1" });
    await screen.findByTestId("editor");
    server.use(
      http.get(api("/me"), () => new HttpResponse(null, { status: 401 })),
      http.post(api("/auth/refresh"), () => new HttpResponse(null, { status: 401 })),
    );
    const last = editor.mock.calls.at(-1)?.[0] as (Props & { onUnauthorized: () => void }) | undefined;
    last?.onUnauthorized();
    await waitFor(() => expect(tokens.get()).toBeNull());
  });

  describe("unsaved-changes guard", () => {
    const open = async () => {
      signIn();
      const r = await renderRouted(<EditorHost fileId="f1" />, { path: "/d/f/f1" });
      await screen.findByTestId("editor");
      return r.router;
    };

    it("lets the router leave when nothing is unsaved, without asking", async () => {
      const router = await open();
      await router.navigate({ to: "/d" });
      expect(router.state.location.pathname).toBe("/d");
      expect(unsaved.asked).toBe(0);
      expect(unsaved.flushed).toBe(1); // pending edits pushed as the navigation proceeds
      tokens.set(null);
    });

    it("blocks navigation while dirty when the person chooses to stay", async () => {
      const router = await open();
      Object.assign(unsaved, { dirty: true, answer: false });
      void router.navigate({ to: "/d" }); // a blocked navigation never settles
      await waitFor(() => expect(unsaved.asked).toBe(1));
      await new Promise((r) => setTimeout(r, 50));
      expect(router.state.location.pathname).toBe("/d/f/f1");
      expect(unsaved.flushed).toBe(0);
      tokens.set(null);
    });

    it("goes ahead while dirty when the person confirms leaving", async () => {
      const router = await open();
      Object.assign(unsaved, { dirty: true, answer: true });
      await router.navigate({ to: "/d" });
      expect(unsaved.asked).toBe(1);
      expect(router.state.location.pathname).toBe("/d");
      tokens.set(null);
    });

    it("does not ask twice for a move the editor made after its own guard", async () => {
      const router = await open();
      Object.assign(unsaved, { dirty: true, answer: false });
      const onNavigate = (editor.mock.calls.at(-1)?.[0] as Props | undefined)?.onNavigate as (t: unknown, o: { replace: boolean }) => void;
      onNavigate({ to: "home" }, { replace: false });
      await waitFor(() => expect(router.state.location.pathname).toBe("/d"));
      expect(unsaved.asked).toBe(0);
      tokens.set(null);
    });
  });
});

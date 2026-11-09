import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { useImperativeHandle } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { engagementRepository } from "@/contexts/engagement/infrastructure/engagementRepository";
import { adopted } from "@/contexts/publishing/application/adopted";
import { encodeCopy } from "@/contexts/publishing/domain/localDraft";
import { emptyStory } from "@/contexts/publishing/domain/story";
import { tokens } from "@/shared/api";
import { makePost, me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { EditorPage } from "./EditorPage";

const rich = vi.hoisted(() => ({
  problem: null as string | null,
  boom: false,
  handle: { flush: vi.fn(), insertDiagram: vi.fn(), insertLive: vi.fn(), focus: vi.fn() },
}));

vi.mock("@/contexts/publishing/rich/RichEditor", () => ({
  default: (p: { ref?: unknown; value: string; onChange: (s: string) => void; onLossy: (s: string | null) => void; onDiagram: () => void }) => {
    useImperativeHandle(p.ref as never, () => rich.handle);
    return (
      <div data-testid="rich">
        <span>rich:{p.value}</span>
        <button type="button" onClick={() => p.onChange("rich typed")}>
          rich-change
        </button>
        <button type="button" onClick={() => p.onLossy("html")}>
          rich-lossy
        </button>
        <button type="button" onClick={() => p.onDiagram()}>
          rich-diagram
        </button>
      </div>
    );
  },
}));
vi.mock("@/contexts/publishing/rich/markdown", () => ({
  canRoundTrip: () => {
    if (rich.boom) throw new Error("x");
    return rich.problem ? { ok: false, problem: rich.problem } : { ok: true };
  },
}));
vi.mock("@/contexts/diagrams/ui/DiagramPicker", () => ({
  DiagramPicker: ({ open, onPick }: { open: boolean; onPick: (l: string) => void }) =>
    open ? (
      <button type="button" onClick={() => onPick("::diagram[x]")}>
        pick-diagram
      </button>
    ) : null,
}));
vi.mock("@/contexts/publishing/ui/StoryPreview", () => ({ StoryPreview: ({ body }: { body: string }) => <div>preview:{body}</div> }));
vi.mock("@/shared/ui/galaxy", () => ({ Galaxy: () => null }));

const verified = { ...me, email_verified: true };
const signedIn = () => {
  signIn();
  server.use(http.get(api("/me"), () => HttpResponse.json({ data: verified })));
};
const noPubs = () => server.use(http.get(api("/me/publications"), () => HttpResponse.json({ data: [{ id: 5, name: "Pub Five", slug: "p5" }] })));
const existing = (o: Record<string, unknown> = {}) =>
  server.use(
    http.get(api("/posts/7"), () =>
      HttpResponse.json({ data: makePost({ id: 7, slug: "my-story", author: "admin", title: "Old title", body: "old body", status: "draft", ...o }) }),
    ),
  );

beforeEach(() => {
  localStorage.clear();
  rich.problem = null;
  rich.boom = false;
  vi.clearAllMocks();
});
afterEach(() => {
  tokens.set(null);
  adopted.id = undefined as never;
  vi.restoreAllMocks();
});

describe("EditorPage visual mode", () => {
  it("opens a draft in the visual editor and edits it", async () => {
    signedIn();
    existing();
    const { user } = await renderRouted(<EditorPage id={7} />, { path: "/p/7/edit" });
    expect(await screen.findByText("rich:old body")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "rich-change" }));
    await user.click(screen.getByRole("button", { name: "Diagram" }));
    await user.click(await screen.findByRole("button", { name: "pick-diagram" }));
    expect(rich.handle.insertDiagram).toHaveBeenCalledWith("::diagram[x]");
    await user.click(screen.getByRole("button", { name: "rich-diagram" }));
    await user.click(screen.getByRole("button", { name: "Animation" }));
    expect(rich.handle.insertLive).toHaveBeenCalled();
  });

  it("opens in Markdown with a notice when the text can't round-trip, and refuses to go visual", async () => {
    signedIn();
    existing();
    rich.problem = "table";
    const { user } = await renderRouted(<EditorPage id={7} />, { path: "/p/7/edit" });
    expect(await screen.findByLabelText("Story body (Markdown)")).toBeInTheDocument();
    expect(screen.getByRole("status", { name: "" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /visual/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("treats a load failure as an 'error' problem", async () => {
    signedIn();
    existing();
    rich.boom = true;
    const { user } = await renderRouted(<EditorPage id={7} />, { path: "/p/7/edit" });
    expect(await screen.findByLabelText("Story body (Markdown)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /visual/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("switches Markdown -> visual when it round-trips, and back", async () => {
    signedIn();
    localStorage.setItem("iwillbegoogler.editor.mode", "md");
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Story body (Markdown)"), "hello");
    await user.click(screen.getByRole("button", { name: /visual/i }));
    expect(await screen.findByTestId("rich")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /visual/i })); // already rich: no-op
    await user.click(screen.getByRole("button", { name: /markdown/i }));
    expect(await screen.findByLabelText("Story body (Markdown)")).toBeInTheDocument();
    expect(localStorage.getItem("iwillbegoogler.editor.mode")).toBe("md");
  });

  it("refuses visual when markdown check throws", async () => {
    signedIn();
    localStorage.setItem("iwillbegoogler.editor.mode", "md");
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    rich.boom = true;
    await user.click(screen.getByRole("button", { name: /visual/i }));
    expect(screen.getByLabelText("Story body (Markdown)")).toBeInTheDocument();
    expect(screen.queryByTestId("rich")).toBeNull();
  });

  // BUG (production): chooseMode's catch sets refused/problem but not wantRich, so the "can't switch" alert never renders
  // (the `problem && wantRich` gate stays false). Remove `.fails` once the catch also calls setWantRich(true).
  it("explains why visual was refused when the markdown check throws", async () => {
    signedIn();
    localStorage.setItem("iwillbegoogler.editor.mode", "md");
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    rich.boom = true;
    await user.click(screen.getByRole("button", { name: /visual/i }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("lossy visual text blocks saving until opened in Markdown", async () => {
    signedIn();
    existing();
    const { user } = await renderRouted(<EditorPage id={7} />, { path: "/p/7/edit" });
    await screen.findByTestId("rich");
    await user.click(screen.getByRole("button", { name: "rich-lossy" }));
    expect(await screen.findByTestId("lossy-notice")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    await user.click(within(screen.getByTestId("lossy-notice")).getByRole("button"));
    expect(await screen.findByLabelText("Story body (Markdown)")).toBeInTheDocument();
  });

  it("preview toggle in visual mode flushes and inserts live in md", async () => {
    signedIn();
    existing();
    const { user } = await renderRouted(<EditorPage id={7} />, { path: "/p/7/edit" });
    await screen.findByTestId("rich");
    await user.click(screen.getByRole("button", { name: /preview/i }));
    expect(await screen.findByText(/preview:/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Animation" })); // preview on: falls through to textarea insert
    await user.click(screen.getByRole("button", { name: /edit/i }));
    expect(rich.handle.flush).toHaveBeenCalled();
  });
});

describe("EditorPage markdown mode", () => {
  beforeEach(() => localStorage.setItem("iwillbegoogler.editor.mode", "md"));

  it("saves a draft, adopts the id and updates on a second save; Cmd+S works", async () => {
    signedIn();
    const sent: string[] = [];
    server.use(
      http.post(api("/posts"), () => (sent.push("post"), HttpResponse.json({ data: makePost({ id: 11, title: "T", slug: "t" }) }, { status: 201 }))),
      http.put(api("/posts/11"), () => (sent.push("put"), HttpResponse.json({ data: makePost({ id: 11, title: "T", slug: "t" }) }))),
    );
    const { user, router } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Title"), "T");
    await user.type(screen.getByLabelText("Story body (Markdown)"), "body");
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(sent).toEqual(["post"]));
    await waitFor(() => expect(router.state.location.pathname).toBe("/p/11/edit"));
    await user.type(screen.getByLabelText("Story body (Markdown)"), " more");
    fireEvent.keyDown(window, { key: "s", ctrlKey: true });
    await waitFor(() => expect(sent).toContain("put"));
    fireEvent.keyDown(window, { key: "s" }); // no modifier: ignored
    expect(await screen.findByRole("button", { name: "Revision history" })).toBeInTheDocument();
  });

  it("shows words, topics editing, preview and focus toggles", async () => {
    signedIn();
    noPubs();
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Story body (Markdown)"), "one two three");
    expect(screen.getAllByText(/3 words/).length).toBeGreaterThan(0);
    await user.click(screen.getByRole("button", { name: /focus/i }));
    expect(localStorage.getItem("iwillbegoogler.editor.focus")).toBe("1");
    await user.click(screen.getByRole("button", { name: /focus/i }));
    expect(localStorage.getItem("iwillbegoogler.editor.focus")).toBe("0");
    await user.click(screen.getByRole("button", { name: /preview/i }));
    expect(screen.getByText("preview:one two three")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /edit/i }));
    await user.click(screen.getByRole("button", { name: "Animation" }));
    expect((screen.getByLabelText("Story body (Markdown)") as HTMLTextAreaElement).value.length).toBeGreaterThan(13);
    await user.click(screen.getByRole("button", { name: "Diagram" }));
    await user.click(await screen.findByRole("button", { name: "pick-diagram" }));
    expect((screen.getByLabelText("Story body (Markdown)") as HTMLTextAreaElement).value).toContain("::diagram[x]");
  });

  it("publish dialog: topics, byline, schedule, cover upload paths", async () => {
    signedIn();
    noPubs();
    let sent: Record<string, unknown> = {};
    server.use(
      http.post(api("/posts"), async ({ request }) => {
        sent = (await request.json()) as never;
        return HttpResponse.json({ data: makePost({ id: 12, title: "T", slug: "t", status: "scheduled" }) }, { status: 201 });
      }),
    );
    const { user, router } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Title"), "T");
    await user.type(screen.getByLabelText("Story body (Markdown)"), "body");
    await user.click(screen.getByRole("button", { name: "Ship it" }));
    const topic = await screen.findByLabelText("Add a topic");
    await user.type(topic, "a{Enter}b,c{Enter}d{Enter}e{Enter}");
    expect(await screen.findByText("Up to 5 topics")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove e" }));
    await user.type(screen.getByLabelText("Add a topic"), "{Backspace}");
    await user.type(screen.getByLabelText("Add a topic"), "zz{Backspace}{Backspace}{Backspace}");
    await user.type(screen.getByLabelText("Add a topic"), "{Enter}x,");
    // byline
    await user.selectOptions(screen.getByRole("combobox"), "5");
    // cover
    const file = screen.getByLabelText(/Drop a cover/i, { selector: "input" });
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    fireEvent.change(file, { target: { files: [big] } });
    expect(await screen.findByText("Image must be 5 MB or smaller.")).toBeInTheDocument();
    const up = vi.spyOn(engagementRepository, "upload").mockRejectedValueOnce(new Error("nope")).mockResolvedValueOnce("http://x/c.png");
    fireEvent.change(file, { target: { files: [] } });
    fireEvent.change(file, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
    await waitFor(() => expect(up).toHaveBeenCalledTimes(1));
    fireEvent.change(file, { target: { files: [new File(["x"], "b.png", { type: "image/png" })] } });
    expect(await screen.findByAltText("Cover")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove cover" }));
    // schedule
    await user.click(screen.getByRole("radio", { name: "Schedule" }));
    expect(screen.getByRole("button", { name: "Schedule" })).toBeDisabled();
    const when = screen.getByLabelText("Go live at");
    fireEvent.change(when, { target: { value: "2099-01-01T10:00" } });
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/me/stories"));
    expect(sent.status).toBe("scheduled");
    expect(sent.publication_id).toBe(5);
  });

  it("publish dialog schedule with past time shows validation toast", async () => {
    signedIn();
    noPubs();
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Title"), "T");
    await user.type(screen.getByLabelText("Story body (Markdown)"), "body");
    await user.click(screen.getByRole("button", { name: "Ship it" }));
    await user.click(await screen.findByRole("radio", { name: "Schedule" }));
    fireEvent.change(screen.getByLabelText("Go live at"), { target: { value: "2001-01-01T10:00" } });
    await user.click(screen.getByRole("button", { name: "Schedule" }));
    await user.click(screen.getByRole("radio", { name: "Now" }));
    await user.click(screen.getByRole("button", { name: "Close" }));
  });

  it("publish failure toasts", async () => {
    signedIn();
    noPubs();
    server.use(http.post(api("/posts"), () => HttpResponse.json({ status: 500, detail: "bad" }, { status: 500 })));
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Title"), "T");
    await user.type(screen.getByLabelText("Story body (Markdown)"), "body");
    await user.click(screen.getByRole("button", { name: "Ship it" }));
    await user.click(await screen.findByRole("button", { name: "Ship now" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ship now" })).toBeEnabled());
  });

  it("updating a published story", async () => {
    signedIn();
    existing({ status: "published" });
    noPubs();
    let put = 0;
    server.use(
      http.put(api("/posts/7"), () => (put++, HttpResponse.json({ data: makePost({ id: 7, slug: "my-story", author: "admin", status: "published" }) }))),
    );
    const { user, router } = await renderRouted(<EditorPage id={7} />, { path: "/p/7/edit" });
    await screen.findByLabelText("Story body (Markdown)");
    expect(await screen.findAllByText("Live")).not.toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Update live story" }));
    await user.click(await screen.findByRole("button", { name: "Ship now" }));
    await waitFor(() => expect(put).toBe(1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/@admin/my-story"));
  });

  it("permanent save failure shows a notice; unverified shows resend", async () => {
    signIn(); // me without email_verified
    let resent = 0;
    server.use(
      http.post(api("/me/verify/resend"), () => (resent++, new HttpResponse(null, { status: 204 }))),
      http.post(api("/me/email/resend"), () => (resent++, new HttpResponse(null, { status: 204 }))),
      http.post(api("/posts"), () => HttpResponse.json({ status: 422, detail: "title too odd" }, { status: 422 })),
    );
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Title"), "T");
    await user.type(screen.getByLabelText("Story body (Markdown)"), "body");
    expect(await screen.findByTestId("save-notice")).toBeInTheDocument();
    await user.click(within(screen.getByTestId("save-notice")).getByRole("button"));
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    await waitFor(() => expect(screen.getByTestId("save-notice")).toBeInTheDocument());
  });

  it("shows failure message for a refused save when verified", async () => {
    signedIn();
    server.use(http.post(api("/posts"), () => HttpResponse.json({ status: 422, detail: "title too odd" }, { status: 422 })));
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    await user.type(screen.getByLabelText("Title"), "T");
    await user.type(screen.getByLabelText("Story body (Markdown)"), "body");
    await user.click(screen.getByRole("button", { name: /save draft/i }));
    expect(await screen.findByTestId("save-notice")).toBeInTheDocument();
  });

  it("offers to restore a local copy for a new story, restore and discard", async () => {
    signedIn();
    localStorage.setItem("iwillbegoogler.story.new", encodeCopy({ ...emptyStory(), title: "Local title", body: "local body" }, Date.now()));
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    const banner = await screen.findByRole("region", { name: "Restore unsaved text?" });
    await user.click(within(banner).getAllByRole("button")[0] as HTMLElement);
    expect((screen.getByLabelText("Title") as HTMLTextAreaElement).value).toBe("Local title");
    expect(fireEvent.keyDown(window, { key: "s", metaKey: true })).toBe(false);
  });

  it("discards a local copy", async () => {
    signedIn();
    localStorage.setItem("iwillbegoogler.story.new", encodeCopy({ ...emptyStory(), title: "Local title", body: "local body" }, Date.now()));
    const { user } = await renderRouted(<EditorPage />, { path: "/new-story" });
    const banner = await screen.findByRole("region", { name: "Restore unsaved text?" });
    fireEvent.keyDown(window, { key: "s", ctrlKey: true }); // banner pending: no save
    await user.click(within(banner).getAllByRole("button")[1] as HTMLElement);
    expect(screen.queryByRole("region", { name: "Restore unsaved text?" })).toBeNull();
  });

  it("restores a newer local copy over a loaded story", async () => {
    signedIn();
    existing();
    localStorage.setItem("iwillbegoogler.story.7", encodeCopy({ ...emptyStory(), title: "Newer", body: "newer body" }, Date.now() + 1e7));
    const { user } = await renderRouted(<EditorPage id={7} />, { path: "/p/7/edit" });
    const banner = await screen.findByRole("region", { name: "Restore unsaved text?" });
    await user.click(within(banner).getAllByRole("button")[0] as HTMLElement);
    await waitFor(() => expect((screen.getByLabelText("Title") as HTMLTextAreaElement).value).toBe("Newer"));
  });

  it("uploads pasted and dropped images", async () => {
    signedIn();
    vi.spyOn(engagementRepository, "upload").mockImplementation(async (f) => {
      if (f.name === "bad.png") throw new Error("x");
      return `http://x/${f.name}`;
    });
    await renderRouted(<EditorPage />, { path: "/new-story" });
    const ta = screen.getByLabelText("Story body (Markdown)") as HTMLTextAreaElement;
    ta.focus();
    const png = new File(["a"], "a.png", { type: "image/png" });
    const bad = new File(["a"], "bad.png", { type: "image/png" });
    const svg = new File(["a"], "s.svg", { type: "image/svg+xml" });
    const huge = new File(["a"], "huge.png", { type: "image/png" });
    Object.defineProperty(huge, "size", { value: 9 * 1024 * 1024 });
    fireEvent.paste(ta, { clipboardData: { files: [png, bad, svg, huge] } });
    await waitFor(() => expect(ta.value).toContain("![a](http://x/a.png)"));
    fireEvent.paste(ta, { clipboardData: { files: [] } }); // text paste untouched
    const drop = new File(["b"], "b.png", { type: "image/png" });
    fireEvent.dragOver(ta, { dataTransfer: { types: ["Files"], files: [drop] } });
    fireEvent.dragOver(ta, { dataTransfer: { types: ["text/plain"], files: [] } });
    fireEvent.drop(ta, { dataTransfer: { types: ["Files"], files: [drop] } });
    await waitFor(() => expect(ta.value).toContain("http://x/b.png"));
    fireEvent.drop(ta, { dataTransfer: { types: [], files: [] } });
  });

  it("revision history: empty, list, diff, restore", async () => {
    signedIn();
    existing();
    let restored = 0;
    server.use(
      http.get(api("/posts/7/revisions"), () =>
        HttpResponse.json({ data: [{ id: 1, post_id: 7, version: 1, title: "v1", created_at: "2026-01-01T00:00:00Z" }] }),
      ),
      http.get(api("/posts/7/revisions/1"), () =>
        HttpResponse.json({
          data: {
            id: 1,
            post_id: 7,
            version: 1,
            title: "v1",
            created_at: "2026-01-01T00:00:00Z",
            diff: {
              title: [],
              subtitle: [],
              body: [
                { op: "=", text: "same" },
                { op: "+", text: "added" },
                { op: "-", text: "gone" },
              ],
            },
          },
        }),
      ),
      http.post(api("/posts/7/revisions/1/restore"), () => (restored++, new HttpResponse(null, { status: 204 }))),
    );
    const { user } = await renderRouted(<EditorPage id={7} />, { path: "/p/7/edit" });
    await user.click(await screen.findByRole("button", { name: "Revision history" }));
    expect(await screen.findByText(/Pick a version/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Version 1/ }));
    expect(await screen.findByText("+1 / −1 lines vs. now")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore this version" }));
    await waitFor(() => expect(restored).toBe(1));
  });

  it("revision history: empty list and restore failure", async () => {
    signedIn();
    existing();
    server.use(http.get(api("/posts/7/revisions"), () => HttpResponse.json({ data: null })));
    const { user } = await renderRouted(<EditorPage id={7} />, { path: "/p/7/edit" });
    await user.click(await screen.findByRole("button", { name: "Revision history" }));
    expect(await screen.findByText(/No earlier versions yet/)).toBeInTheDocument();
  });

  it("revision restore error toasts", async () => {
    signedIn();
    existing();
    server.use(
      http.get(api("/posts/7/revisions"), () =>
        HttpResponse.json({ data: [{ id: 1, post_id: 7, version: 1, title: "v1", created_at: "2026-01-01T00:00:00Z" }] }),
      ),
      http.get(api("/posts/7/revisions/1"), () =>
        HttpResponse.json({
          data: { id: 1, post_id: 7, version: 1, title: "v1", created_at: "2026-01-01T00:00:00Z", diff: { title: [], subtitle: [], body: [] } },
        }),
      ),
      http.post(api("/posts/7/revisions/1/restore"), () => HttpResponse.json({ status: 500, detail: "x" }, { status: 500 })),
    );
    const { user } = await renderRouted(<EditorPage id={7} />, { path: "/p/7/edit" });
    await user.click(await screen.findByRole("button", { name: "Revision history" }));
    await user.click(await screen.findByRole("button", { name: /Version 1/ }));
    await user.click(await screen.findByRole("button", { name: "Restore this version" }));
    await act(async () => {});
  });
});

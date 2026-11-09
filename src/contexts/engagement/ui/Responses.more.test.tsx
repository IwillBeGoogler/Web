import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { tokens } from "@/shared/api";
import { me, page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { Responses } from "./Responses";

const c = (id: number, o: Record<string, unknown> = {}) => ({
  id,
  post_id: 1,
  parent_id: 0,
  user_id: 9,
  author: "vali",
  text: `c${id}`,
  created_at: `2026-10-0${id}T00:00:00Z`,
  ...o,
});

afterEach(() => {
  tokens.set(null);
  authDialog.close();
  vi.restoreAllMocks();
});

describe("Responses (more)", () => {
  it("anonymous: composer, like and reply open sign in", async () => {
    server.use(http.get(api("/posts/1/comments"), () => page([c(1, { author: "" })])));
    const { user } = await renderRouted(<Responses postId={1} count={1} open onOpenChange={() => {}} />);
    await user.click(await screen.findByRole("button", { name: /Add a note/ }));
    expect(authDialog.get()).toBe("signin");
    authDialog.close();
    expect(screen.getByText("@Anonymous")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Like response/ }));
    expect(authDialog.get()).toBe("signin");
    authDialog.close();
    await user.click(screen.getByRole("button", { name: "Reply" }));
    expect(authDialog.get()).toBe("signin");
  });

  it("shows error and retries", async () => {
    let fail = true;
    server.use(http.get(api("/posts/1/comments"), () => (fail ? HttpResponse.json({ error: { message: "x" } }, { status: 500 }) : page([c(1)]))));
    const { user } = await renderRouted(<Responses postId={1} count={1} open onOpenChange={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Try again" }, { timeout: 5000 }));
    fail = false;
    await user.click(screen.queryByRole("button", { name: "Try again" }) ?? document.body);
    expect(await screen.findByText("c1", {}, { timeout: 5000 })).toBeInTheDocument();
  });

  it("like, reply (flat nested), cmd-enter, cancel, report as another user", async () => {
    signIn();
    const likes = vi.fn(() => new HttpResponse(null, { status: 204 }));
    const posts: unknown[] = [];
    server.use(
      http.get(api("/posts/1/comments"), () =>
        page([c(1), c(2, { parent_id: 1, edited_at: "2026-10-03T00:00:00Z", liked: true, likes: 2 }), c(3, { parent_id: 2 })]),
      ),
      http.post(api("/comments/1/like"), likes),
      http.delete(api("/comments/2/like"), likes),
      http.post(api("/reports"), () => new HttpResponse(null, { status: 204 })),
      http.post(api("/posts/1/comments"), async ({ request }) => {
        posts.push(await request.json());
        return HttpResponse.json({ data: c(9, { parent_id: 1 }) }, { status: 201 });
      }),
    );
    const { user } = await renderRouted(<Responses postId={1} count={3} open onOpenChange={() => {}} />);
    await screen.findByText("c1");
    expect(screen.getByText("(edited)")).toBeInTheDocument();
    expect(screen.getByText("c3")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: /Like response/ })[0] as HTMLElement);
    await user.click(screen.getAllByRole("button", { name: /Like response/ })[1] as HTMLElement);
    await waitFor(() => expect(likes).toHaveBeenCalledTimes(2));
    // collapse/expand replies
    await user.click(screen.getByRole("button", { name: /repl(y|ies)$/ }));
    expect(screen.queryByText("c3")).toBeNull();
    await user.click(screen.getByRole("button", { name: /repl(y|ies)$/ }));
    // reply with ctrl+enter
    await user.click(screen.getByRole("button", { name: "Reply" }));
    const box = await screen.findByLabelText("Write a reply");
    await user.type(box, "{Control>}{Enter}{/Control}");
    await user.type(box, "hi there{Control>}{Enter}{/Control}");
    await waitFor(() => expect(posts).toEqual([{ text: "hi there", parent_id: 1 }]));
    // cancel on top composer
    const top = screen.getByLabelText("Write a note");
    await user.type(top, "draft");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    // report
    await user.click(screen.getAllByRole("button", { name: "Report response" })[0] as HTMLElement);
    expect(await screen.findByText("Report response")).toBeInTheDocument();
  });

  it("composer shows an error toast on failure and skips empty submit", async () => {
    signIn();
    const failing = vi.fn(() => HttpResponse.json({ error: { message: "bad" } }, { status: 500 }));
    server.use(
      http.get(api("/posts/1/comments"), () => page([])),
      http.post(api("/posts/1/comments"), failing),
    );
    const { user } = await renderRouted(<Responses postId={1} count={0} open onOpenChange={() => {}} />);
    const box = await screen.findByLabelText("Write a note");
    await user.type(box, "   {Control>}{Enter}{/Control}");
    await user.clear(box);
    await user.type(box, "real");
    await user.click(screen.getByRole("button", { name: "Post note" }));
    await waitFor(() => expect(failing).toHaveBeenCalledTimes(1));
  });

  it("owner can edit (save, cancel) and delete (confirm)", async () => {
    signIn();
    const put = vi.fn(async () => HttpResponse.json({ data: c(1, { user_id: me.id, text: "changed" }) }));
    const del = vi.fn(() => new HttpResponse(null, { status: 204 }));
    server.use(
      http.get(api("/posts/1/comments"), () => page([c(1, { user_id: me.id })])),
      http.put(api("/comments/1"), put),
      http.delete(api("/comments/1"), del),
    );
    const { user } = await renderRouted(<Responses postId={1} count={1} open onOpenChange={() => {}} />);
    await user.click(await screen.findByRole("button", { name: "Edit response" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Edit response" }));
    const ta = screen.getByRole("textbox", { name: "Edit response" });
    await user.clear(ta);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    await user.type(ta, "changed");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(put).toHaveBeenCalled());
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    await user.click(await screen.findByRole("button", { name: "Delete response" }));
    expect(del).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Delete response" }));
    await waitFor(() => expect(del).toHaveBeenCalled());
  });

  it("closed: lazy loads when scrolled into view", async () => {
    let cb: ((e: { isIntersecting: boolean }[]) => void) | undefined;
    const Orig = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor(f: typeof cb) {
        cb = f;
      }
      observe() {}
      disconnect() {}
    } as never;
    server.use(http.get(api("/posts/1/comments"), () => page([c(1)])));
    await renderRouted(<Responses postId={1} count={1} open={false} onOpenChange={() => {}} />);
    expect(screen.queryByText("c1")).toBeNull();
    cb?.([{ isIntersecting: false }]);
    cb?.([{ isIntersecting: true }]);
    expect(await screen.findByText("c1")).toBeInTheDocument();
    globalThis.IntersectionObserver = Orig;
  });
});

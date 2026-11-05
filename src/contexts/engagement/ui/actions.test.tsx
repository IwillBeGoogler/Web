import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { feedQuery } from "@/contexts/reading/application/queries";
import { tokens } from "@/shared/api";
import { makePost, signIn } from "@/test/fixtures";
import { renderRouted, testQueryClient } from "@/test/render";
import { api, server } from "@/test/server";
import { BookmarkButton, ClapButton } from "./actions";

describe("BookmarkButton", () => {
  it("asks anonymous readers to sign in", async () => {
    const { user } = await renderRouted(<BookmarkButton post={{ id: 1, bookmarked: false }} />);
    await user.click(screen.getByRole("button", { name: "Save for later" }));
    expect(authDialog.get()).toBe("signin");
    authDialog.close();
  });
  it("saves for later for signed-in readers", async () => {
    signIn();
    const hit = vi.fn(() => new HttpResponse(null, { status: 204 }));
    server.use(http.post(api("/posts/1/bookmark"), hit));
    const { user } = await renderRouted(<BookmarkButton post={{ id: 1, bookmarked: false }} />);
    await user.click(screen.getByRole("button", { name: "Save for later" }));
    await waitFor(() => expect(hit).toHaveBeenCalled());
    tokens.set(null);
  });
});

describe("ClapButton", () => {
  it("counts up immediately and batches the request", async () => {
    signIn();
    const bodies: unknown[] = [];
    server.use(
      http.post(api("/posts/1/clap"), async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ data: makePost({ claps: 12, my_claps: 2 }) });
      }),
    );
    const qc = testQueryClient();
    const source = { kind: "latest" } as const;
    qc.setQueryData(feedQuery(source).queryKey, {
      pages: [{ items: [makePost()], meta: { page: 1, limit: 10, total: 1, hasMore: false, nextCursor: undefined } }],
      pageParams: [{}],
    });
    const Probe = () => {
      const d = qc.getQueryData(feedQuery(source).queryKey);
      const p = d?.pages[0]?.items[0];
      return p ? <ClapButton post={p} /> : null;
    };
    const { user } = await renderRouted(<Probe />, { qc });
    const btn = screen.getByRole("button", { name: /Spark/ });
    await user.click(btn);
    await waitFor(() => expect(bodies).toEqual([{ count: 1 }]), { timeout: 2000 });
    expect(qc.getQueryData(feedQuery(source).queryKey)?.pages[0]?.items[0]?.claps).toBe(12);
    tokens.set(null);
  });
});

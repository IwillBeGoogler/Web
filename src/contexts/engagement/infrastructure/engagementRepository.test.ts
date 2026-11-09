import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { tokens } from "@/shared/api";
import { api, server } from "@/test/server";
import { engagementRepository } from "./engagementRepository";

const post = { id: 1, title: "T", slug: "t", status: "published", author: "ali", created_at: "x", updated_at: "x", claps: 3, my_claps: 1 };

describe("engagementRepository", () => {
  it("clap sends count and returns the post", async () => {
    server.use(
      http.post(api("/posts/1/clap"), async ({ request }) => {
        expect(await request.json()).toEqual({ count: 2 });
        return HttpResponse.json({ data: post });
      }),
    );
    expect((await engagementRepository.clap(1, 2)).my_claps).toBe(1);
  });
  it("bookmark and follow toggle with POST/DELETE", async () => {
    const calls: string[] = [];
    server.use(
      http.all(api("/posts/1/bookmark"), ({ request }) => {
        calls.push(`${request.method} bookmark`);
        return new HttpResponse(null, { status: 204 });
      }),
      http.all(api("/users/ali/follow"), ({ request }) => {
        calls.push(`${request.method} follow`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await engagementRepository.bookmark(1, true);
    await engagementRepository.bookmark(1, false);
    await engagementRepository.follow("ali", true);
    expect(calls).toEqual(["POST bookmark", "DELETE bookmark", "POST follow"]);
  });
  it("notifications carry the unread count", async () => {
    server.use(
      http.get(api("/me/notifications"), () =>
        HttpResponse.json({ data: [{ id: 1, type: "follow", actor: "ali", created_at: "x" }], meta: { page: 1, limit: 20, total: 1, unread: 1 } }),
      ),
    );
    const r = await engagementRepository.notifications({ limit: 20 });
    expect(r.unread).toBe(1);
    expect(r.items[0]?.unread).toBe(true);
  });
  it("posts a reply with parent_id", async () => {
    server.use(
      http.post(api("/posts/1/comments"), async ({ request }) => {
        expect(await request.json()).toEqual({ text: "hi", parent_id: 5 });
        return HttpResponse.json({ data: { id: 9, post_id: 1, parent_id: 5, text: "hi", created_at: "x" } }, { status: 201 });
      }),
    );
    expect((await engagementRepository.comment(1, { text: "hi", parent_id: 5 })).id).toBe(9);
  });

  const ok = () => new HttpResponse(null, { status: 204 });
  const comment = { id: 9, post_id: 1, text: "hi", created_at: "x" };
  it("comments list, edit, like, delete", async () => {
    const likes: string[] = [];
    server.use(
      http.get(api("/posts/1/comments"), () => HttpResponse.json({ data: [comment], meta: {} })),
      http.put(api("/comments/9"), () => HttpResponse.json({ data: comment })),
      http.all(api("/comments/9/like"), ({ request }) => {
        likes.push(request.method);
        return ok();
      }),
      http.delete(api("/comments/9"), ok),
    );
    expect((await engagementRepository.comments(1, {})).items).toHaveLength(1);
    expect((await engagementRepository.editComment(9, "hi")).id).toBe(9);
    await engagementRepository.likeComment(9, true);
    await engagementRepository.likeComment(9, false);
    await engagementRepository.deleteComment(9);
    expect(likes).toEqual(["POST", "DELETE"]);
  });
  it("reports send target id or diagram file id", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post(api("/reports"), async ({ request }) => {
        bodies.push(await request.json());
        return ok();
      }),
    );
    await engagementRepository.report({ type: "post", id: 1 }, "spam", "n");
    await engagementRepository.report({ type: "diagram", fileId: "f" }, "spam", "n");
    expect(bodies).toEqual([
      { target_type: "post", target_id: 1, reason: "spam", note: "n" },
      { target_type: "diagram", target_file_id: "f", reason: "spam", note: "n" },
    ]);
  });
  it("feedback, stream ticket, mark read", async () => {
    server.use(
      http.post(api("/feedback"), ok),
      http.post(api("/me/stream-ticket"), () => HttpResponse.json({ data: { ticket: "tk" } })),
      http.post(api("/me/notifications/read"), ok),
      http.post(api("/me/notifications/4/read"), ok),
    );
    await engagementRepository.feedback({ kind: "bug", message: "m", page_url: "/", user_agent: "ua" } as never);
    expect(await engagementRepository.streamTicket()).toBe("tk");
    await engagementRepository.markAllRead();
    await engagementRepository.markRead(4);
  });
  it("notifications default unread to 0 without meta", async () => {
    server.use(http.get(api("/me/notifications"), () => HttpResponse.json({ data: [], meta: {} })));
    expect((await engagementRepository.notifications({})).unread).toBe(0);
    server.use(http.get(api("/me/notifications"), () => HttpResponse.json({ data: [] })));
    expect((await engagementRepository.notifications({})).unread).toBe(0);
  });
  describe("upload", () => {
    const f = new File(["x"], "a.png");
    it("returns the url, with and without a token", async () => {
      server.use(http.post(api("/uploads"), ({ request }) => HttpResponse.json({ data: { url: request.headers.get("authorization") ?? "none" } })));
      expect(await engagementRepository.upload(f)).toBe("none");
      tokens.set({ token: "t", expiresAt: "2030-01-01T00:00:00Z" });
      expect(await engagementRepository.upload(f)).toBe("Bearer t");
      tokens.set(null);
    });
    it("throws ApiError on failure or missing url", async () => {
      server.use(http.post(api("/uploads"), () => HttpResponse.json({ status: 413 }, { status: 413 })));
      await expect(engagementRepository.upload(f)).rejects.toMatchObject({ status: 413 });
      server.use(http.post(api("/uploads"), () => HttpResponse.json({ data: {} })));
      await expect(engagementRepository.upload(f)).rejects.toBeDefined();
      server.use(http.post(api("/uploads"), () => new HttpResponse("nope", { status: 500 })));
      await expect(engagementRepository.upload(f)).rejects.toBeDefined();
    });
  });
});

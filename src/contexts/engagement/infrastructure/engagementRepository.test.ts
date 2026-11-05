import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
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
});

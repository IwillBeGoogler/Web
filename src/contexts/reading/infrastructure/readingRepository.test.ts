import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { api, server } from "@/test/server";
import { readingRepository } from "./readingRepository";

const post = { id: 1, title: "T", slug: "t", status: "published", author: "ali", created_at: "x", updated_at: "x" };
const page = (q: Record<string, string>) => HttpResponse.json({ data: [{ ...post, title: JSON.stringify(q) }], meta: { page: 1, limit: 20, total: 1 } });
const params = (r: Request) => Object.fromEntries(new URL(r.url).searchParams);

describe("readingRepository.feed", () => {
  it.each([
    [{ kind: "latest" } as const, "/posts", {}],
    [{ kind: "tag", tag: "go" } as const, "/posts", { tag: "go" }],
    [{ kind: "search", q: "docker" } as const, "/posts", { q: "docker" }],
    [{ kind: "for-you" } as const, "/me/for-you", {}],
    [{ kind: "following" } as const, "/me/feed", {}],
    [{ kind: "bookmarks" } as const, "/me/bookmarks", {}],
    [{ kind: "user", username: "ali" } as const, "/users/ali/posts", {}],
    [{ kind: "mine", status: "draft" } as const, "/me/posts", { status: "draft" }],
  ])("%o hits %s", async (source, path, q) => {
    server.use(http.get(api(path), ({ request }) => page(params(request))));
    const r = await readingRepository.feed(source, { limit: 5 });
    expect(JSON.parse(r.items[0]?.title ?? "{}")).toEqual({ ...q, limit: "5" });
  });
});

describe("readingRepository", () => {
  it("loads a post by slug and tolerates null lists", async () => {
    server.use(
      http.get(api("/slug/t"), () => HttpResponse.json({ data: { ...post, body_html: "<p>x</p>" } })),
      http.get(api("/posts/trending"), () => HttpResponse.json({ data: null })),
    );
    expect((await readingRepository.bySlug("t")).body_html).toBe("<p>x</p>");
    expect(await readingRepository.trending()).toEqual([]);
  });
  it("view/read swallow errors", async () => {
    server.use(
      http.post(api("/posts/1/view"), () => HttpResponse.error()),
      http.post(api("/posts/1/read"), () => HttpResponse.error()),
    );
    await expect(readingRepository.view(1)).resolves.toBeUndefined();
    await expect(readingRepository.read(1, 0.7)).resolves.toBeUndefined();
  });
});

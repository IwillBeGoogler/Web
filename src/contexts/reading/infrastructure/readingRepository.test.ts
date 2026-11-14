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
  it("publication and list feeds", async () => {
    server.use(
      http.get(api("/publications/p%201/posts"), () => page({})),
      http.get(api("/lists/l/posts"), () => page({})),
    );
    expect((await readingRepository.feed({ kind: "publication", slug: "p 1" }, {})).items).toHaveLength(1);
    expect((await readingRepository.feed({ kind: "list", slug: "l" }, {})).items).toHaveLength(1);
  });
  it("byId, related, tags, profile, suggestions", async () => {
    server.use(
      http.get(api("/posts/1"), () => HttpResponse.json({ data: post })),
      http.get(api("/posts/1/related"), () => HttpResponse.json({ data: [post] })),
      http.get(api("/tags"), () => HttpResponse.json({ data: [{ name: "go" }] })),
      http.get(api("/users/a%20b"), () => HttpResponse.json({ data: { id: 1, username: "a", created_at: "x" } })),
      http.get(api("/me/suggestions/users"), () => HttpResponse.json({ data: null })),
      http.get(api("/posts/trending"), () => HttpResponse.json({ data: [post] })),
    );
    expect((await readingRepository.byId(1)).id).toBe(1);
    expect(await readingRepository.related(1)).toHaveLength(1);
    expect((await readingRepository.tags())[0]?.count).toBe(0);
    expect((await readingRepository.profile("a b")).username).toBe("a");
    expect(await readingRepository.suggestions()).toEqual([]);
    expect(await readingRepository.trending()).toHaveLength(1);
  });
  it("view/read succeed", async () => {
    server.use(
      http.post(api("/posts/1/view"), () => new HttpResponse(null, { status: 204 })),
      http.post(api("/posts/1/read"), () => new HttpResponse(null, { status: 204 })),
    );
    await readingRepository.view(1);
    await readingRepository.read(1, 0.5);
  });
  it("glossary sends the language and tolerates null", async () => {
    let lang: string | null = null;
    server.use(
      http.get(api("/glossary"), ({ request }) => {
        lang = new URL(request.url).searchParams.get("lang");
        return HttpResponse.json({ data: [{ id: 1, term: "Pod", aliases: null, definition: "d", lang: "" }] });
      }),
    );
    expect(await readingRepository.glossary("uz")).toEqual([{ id: 1, term: "Pod", aliases: [], definition: "d", lang: "" }]);
    expect(lang).toBe("uz");
    server.use(http.get(api("/glossary"), () => HttpResponse.json({ data: null })));
    expect(await readingRepository.glossary("en")).toEqual([]);
  });
});

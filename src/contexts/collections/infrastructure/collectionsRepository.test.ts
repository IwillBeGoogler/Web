import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { api, server } from "@/test/server";
import { highlightsRepository, listsRepository, publicationsRepository, seriesRepository } from "./collectionsRepository";

describe("collections repositories", () => {
  it("me/lists passes post_id and reads contains", async () => {
    server.use(
      http.get(api("/me/lists"), ({ request }) => {
        expect(new URL(request.url).searchParams.get("post_id")).toBe("4");
        return HttpResponse.json({ data: [{ id: 1, slug: "l", name: "L", contains: true }], meta: {} });
      }),
    );
    expect((await listsRepository.mine({}, 4)).items[0]?.contains).toBe(true);
  });
  it("saving to a list toggles PUT/DELETE", async () => {
    const seen: string[] = [];
    server.use(
      http.all(api("/lists/l/posts/4"), ({ request }) => {
        seen.push(request.method);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await listsRepository.setPost("l", 4, true);
    await listsRepository.setPost("l", 4, false);
    expect(seen).toEqual(["PUT", "DELETE"]);
  });
  it("post series is null on 404", async () => {
    server.use(http.get(api("/posts/1/series"), () => HttpResponse.json({ status: 404, detail: "no series" }, { status: 404 })));
    expect(await seriesRepository.ofPost(1)).toBeNull();
  });
  it("series posts are replaced in order", async () => {
    server.use(
      http.put(api("/series/s/posts"), async ({ request }) => {
        expect(await request.json()).toEqual({ post_ids: [3, 1] });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await seriesRepository.setPosts("s", [3, 1]);
  });
  it("highlights and members", async () => {
    server.use(
      http.get(api("/posts/1/highlights"), () => HttpResponse.json({ data: { top: [{ text: "x", start: 0, end: 1, count: 2 }], mine: null } })),
      http.get(api("/publications/p/members"), () => HttpResponse.json({ data: [{ user_id: 1, username: "a", role: "owner" }] })),
    );
    expect((await highlightsRepository.ofPost(1)).top[0]?.count).toBe(2);
    expect((await publicationsRepository.members("p"))[0]?.role).toBe("owner");
  });

  const ok = () => new HttpResponse(null, { status: 204 });
  const list = { id: 1, slug: "l", name: "L" };
  const series = { id: 2, slug: "s", title: "S" };
  const pub = { id: 3, slug: "p", name: "P", my_role: "owner" };
  it("lists crud and reads", async () => {
    server.use(
      http.get(api("/users/a%20b/lists"), () => HttpResponse.json({ data: [list], meta: {} })),
      http.get(api("/lists/l"), () => HttpResponse.json({ data: list })),
      http.get(api("/lists/l/posts"), () => HttpResponse.json({ data: [], meta: {} })),
      http.post(api("/lists"), () => HttpResponse.json({ data: list })),
      http.patch(api("/lists/l"), () => HttpResponse.json({ data: list })),
      http.delete(api("/lists/l"), ok),
    );
    expect((await listsRepository.ofUser("a b", {})).items).toHaveLength(1);
    expect((await listsRepository.get("l")).slug).toBe("l");
    expect((await listsRepository.posts("l", {})).items).toEqual([]);
    const input = { name: "L", description: "", private: false };
    expect((await listsRepository.create(input)).slug).toBe("l");
    expect((await listsRepository.update("l", input)).slug).toBe("l");
    await listsRepository.remove("l");
  });
  it("series crud and reads, ofPost success and non-404 rethrow", async () => {
    server.use(
      http.get(api("/users/u/series"), () => HttpResponse.json({ data: null })),
      http.get(api("/series/s"), () => HttpResponse.json({ data: series })),
      http.get(api("/posts/1/series"), () => HttpResponse.json({ data: { series, position: 1 } })),
      http.get(api("/posts/2/series"), () => HttpResponse.json({ status: 500, detail: "boom" }, { status: 500 })),
      http.post(api("/series"), () => HttpResponse.json({ data: series })),
      http.patch(api("/series/s"), () => HttpResponse.json({ data: series })),
      http.delete(api("/series/s"), ok),
    );
    expect(await seriesRepository.ofUser("u")).toEqual([]);
    expect((await seriesRepository.get("s")).slug).toBe("s");
    expect((await seriesRepository.ofPost(1))?.position).toBe(1);
    await expect(seriesRepository.ofPost(2)).rejects.toBeDefined();
    const body = { title: "S", description: "" };
    expect((await seriesRepository.create(body)).slug).toBe("s");
    expect((await seriesRepository.update("s", body)).slug).toBe("s");
    await seriesRepository.remove("s");
  });
  it("highlights add/remove", async () => {
    server.use(http.post(api("/posts/1/highlights"), ok), http.delete(api("/highlights/9"), ok));
    await highlightsRepository.add(1, 0, 2);
    await highlightsRepository.remove(9);
  });
  it("publications crud, members null fallback", async () => {
    server.use(
      http.get(api("/me/publications"), () => HttpResponse.json({ data: [pub] })),
      http.get(api("/publications/p"), () => HttpResponse.json({ data: pub })),
      http.get(api("/publications/p/members"), () => HttpResponse.json({ data: null })),
      http.get(api("/publications/p/posts"), () => HttpResponse.json({ data: [], meta: {} })),
      http.post(api("/publications"), () => HttpResponse.json({ data: pub })),
      http.patch(api("/publications/p"), () => HttpResponse.json({ data: pub })),
      http.delete(api("/publications/p"), ok),
      http.put(api("/publications/p/members/u"), ok),
      http.delete(api("/publications/p/members/u"), ok),
    );
    expect(await publicationsRepository.mine()).toHaveLength(1);
    expect((await publicationsRepository.get("p")).slug).toBe("p");
    expect(await publicationsRepository.members("p")).toEqual([]);
    expect((await publicationsRepository.posts("p", {})).items).toEqual([]);
    expect((await publicationsRepository.create({ slug: "p", name: "P", description: "" })).slug).toBe("p");
    expect((await publicationsRepository.update("p", { name: "P", description: "", avatar_url: "" })).slug).toBe("p");
    await publicationsRepository.remove("p");
    await publicationsRepository.setMember("p", "u", "editor");
    await publicationsRepository.removeMember("p", "u");
  });
});

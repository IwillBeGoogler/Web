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
});

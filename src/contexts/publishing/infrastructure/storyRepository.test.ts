import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { api, server } from "@/test/server";
import { previewBody, storyRepository, studioRepository } from "./storyRepository";

const post = { id: 1, title: "T", slug: "t", status: "draft", author: "ali", created_at: "x", updated_at: "x" };
const ok = () => new HttpResponse(null, { status: 204 });
const rev = { id: 1, post_id: 1, version: 2, title: "T", created_at: "x" };

describe("storyRepository", () => {
  it("create, update, remove", async () => {
    server.use(
      http.post(api("/posts"), () => HttpResponse.json({ data: post })),
      http.put(api("/posts/1"), () => HttpResponse.json({ data: post })),
      http.delete(api("/posts/1"), ok),
    );
    const body = { title: "T", body: "b" } as never;
    expect((await storyRepository.create(body)).id).toBe(1);
    expect((await storyRepository.update(1, body)).id).toBe(1);
    await storyRepository.remove(1);
  });
  it("previewBody returns html", async () => {
    server.use(http.post(api("/posts/preview"), () => HttpResponse.json({ data: { body_html: "<p>x</p>" } })));
    expect(await previewBody("x")).toBe("<p>x</p>");
  });
});

describe("studioRepository", () => {
  it("stats and daily", async () => {
    server.use(
      http.get(api("/me/stats"), () => HttpResponse.json({ data: [{ post_id: 1, title: "T", slug: "t", status: "published" }], meta: {} })),
      http.get(api("/me/stats/1"), ({ request }) =>
        HttpResponse.json({ data: { post_id: 1, days: new URL(request.url).searchParams.get("days") === "7" ? null : [] } }),
      ),
    );
    expect((await studioRepository.stats({})).items).toHaveLength(1);
    expect((await studioRepository.daily(1)).days).toEqual([]);
    expect((await studioRepository.daily(1, 7)).days).toEqual([]);
  });
  it("pin sets and clears", async () => {
    const seen: string[] = [];
    server.use(
      http.all(api("/me/pin"), ({ request }) => {
        seen.push(request.method);
        return ok();
      }),
    );
    await studioRepository.pin(4);
    await studioRepository.pin(null);
    expect(seen).toEqual(["PUT", "DELETE"]);
  });
  it("import, revisions, restore", async () => {
    server.use(
      http.post(api("/posts/import"), () => HttpResponse.json({ data: post })),
      http.get(api("/posts/1/revisions"), () => HttpResponse.json({ data: null })),
      http.get(api("/posts/1/revisions/2"), () => HttpResponse.json({ data: { ...rev, diff: {} } })),
      http.post(api("/posts/1/revisions/2/restore"), ok),
    );
    expect((await studioRepository.importUrl("https://x.y")).id).toBe(1);
    expect(await studioRepository.revisions(1)).toEqual([]);
    expect((await studioRepository.revision(1, 2)).diff.body).toEqual([]);
    await studioRepository.restore(1, 2);
  });
});

import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { api, server } from "@/test/server";
import { challengesRepository } from "./challengesRepository";

const challenge = { id: 1, user_id: 2, title: "Go", days: 30, visibility: "public", timezone: "UTC", start_date: "2026-01-01" };
const ok = () => new HttpResponse(null, { status: 204 });

describe("challengesRepository", () => {
  it("lists a tab and reads a detail", async () => {
    server.use(
      http.get(api("/challenges"), ({ request }) => {
        expect(new URL(request.url).searchParams.get("tab")).toBe("mine");
        return HttpResponse.json({ data: [challenge], meta: {} });
      }),
      http.get(api("/challenges/1"), () =>
        HttpResponse.json({
          data: { ...challenge, stats: { days_done: 0, current_streak: 0, best_streak: 0, today: 1, ended: false, end_date: "2026-01-30" }, entries: null },
        }),
      ),
      http.get(api("/me/challenges"), () => HttpResponse.json({ data: [{ ...challenge, post_ids: [4] }] })),
    );
    expect((await challengesRepository.list("mine", {})).items).toHaveLength(1);
    expect((await challengesRepository.get(1)).entries).toEqual([]);
    expect((await challengesRepository.running())[0]?.post_ids).toEqual([4]);
  });
  it("post challenge is null on 404", async () => {
    server.use(http.get(api("/posts/4/challenge"), () => HttpResponse.json({ status: 404, detail: "no" }, { status: 404 })));
    expect(await challengesRepository.ofPost(4)).toBeNull();
  });
  it("creates, updates and removes", async () => {
    server.use(
      http.post(api("/challenges"), () => HttpResponse.json({ data: challenge }, { status: 201 })),
      http.patch(api("/challenges/1"), () => HttpResponse.json({ data: challenge })),
      http.delete(api("/challenges/1"), ok),
    );
    const input = { title: "Go", description: "", visibility: "public" as const };
    expect((await challengesRepository.create({ ...input, days: 30, timezone: "UTC" })).id).toBe(1);
    expect((await challengesRepository.update(1, input)).id).toBe(1);
    await challengesRepository.remove(1);
  });
  it("moving a post unlinks before linking", async () => {
    const seen: string[] = [];
    server.use(
      http.all(api("/challenges/:id/posts/4"), ({ request, params }) => {
        seen.push(`${request.method} ${String(params.id)}`);
        return ok();
      }),
    );
    await challengesRepository.setPost(4, 1, 2);
    await challengesRepository.setPost(4, 2, 0);
    await challengesRepository.setPost(4, 2, 2);
    expect(seen).toEqual(["DELETE 1", "PUT 2", "DELETE 2"]);
  });
});

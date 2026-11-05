import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { api, server } from "@/test/server";
import { accountSecurityRepository as repo } from "./accountSecurityRepository";

const user = { id: 1, username: "ali", created_at: "x" };

describe("accountSecurityRepository", () => {
  it("changes the password and returns the fresh session", async () => {
    server.use(
      http.put(api("/me/password"), async ({ request }) => {
        expect(await request.json()).toEqual({ old_password: "a", new_password: "b" });
        return HttpResponse.json({ data: { token: "new", expires_at: "x", user } });
      }),
    );
    expect((await repo.changePassword("a", "b")).token).toBe("new");
  });
  it("2FA setup and enable return the secret and backup codes", async () => {
    server.use(
      http.post(api("/me/2fa/setup"), () => HttpResponse.json({ data: { secret: "S", otpauth_url: "otpauth://totp/x" } })),
      http.post(api("/me/2fa/enable"), () => HttpResponse.json({ data: { backup_codes: ["c1", "c2"] } })),
    );
    expect((await repo.mfaSetup()).secret).toBe("S");
    expect(await repo.mfaEnable("123456")).toEqual(["c1", "c2"]);
  });
  it("unsubscribe sends the signed query", async () => {
    server.use(
      http.post(api("/unsubscribe"), ({ request }) => {
        expect(Object.fromEntries(new URL(request.url).searchParams)).toEqual({ s: "1", a: "2", sig: "z" });
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await repo.unsubscribe("1", "2", "z");
  });
  it("hidden items and followed tags", async () => {
    server.use(
      http.get(api("/me/hidden"), () => HttpResponse.json({ data: [{ kind: "tag", target: "qa", created_at: "x" }], meta: { total: 1 } })),
      http.get(api("/me/tags"), () => HttpResponse.json({ data: null })),
      http.delete(api("/me/hidden/tag/qa"), () => new HttpResponse(null, { status: 204 })),
    );
    expect((await repo.hidden({})).items[0]?.target).toBe("qa");
    expect(await repo.followedTags()).toEqual([]);
    await repo.unhide("tag", "qa");
  });
});

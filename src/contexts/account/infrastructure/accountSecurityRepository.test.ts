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

  const ok = () => new HttpResponse(null, { status: 204 });
  const u = { id: 1, username: "bob" };
  const seen: string[] = [];
  const rec =
    (label: string) =>
    ({ request }: { request: Request }) => {
      seen.push(`${request.method} ${label}`);
      return ok();
    };
  it("auth plumbing posts", async () => {
    seen.length = 0;
    server.use(
      http.post(api("/auth/forgot-password"), rec("forgot")),
      http.post(api("/auth/reset-password"), rec("reset")),
      http.post(api("/auth/verify-email"), rec("verify")),
      http.post(api("/me/verify-email"), rec("resend")),
      http.delete(api("/me"), rec("delete")),
      http.post(api("/auth/logout-all"), rec("logoutAll")),
      http.delete(api("/me/sessions/a%2Fb"), rec("revoke")),
      http.post(api("/me/2fa/disable"), rec("mfaDisable")),
      http.post(api("/me/hidden"), rec("hide")),
    );
    await repo.forgot("a@b.c");
    await repo.reset("t", "pw");
    await repo.verifyEmail("1");
    await repo.resendVerification();
    await repo.deleteAccount("pw");
    await repo.logoutAll();
    await repo.revokeDevice("a/b");
    await repo.mfaDisable("pw", "1");
    await repo.hide("tag", "qa");
    expect(seen).toHaveLength(9);
  });
  it("devices, mfa status, backup codes", async () => {
    server.use(
      http.get(api("/me/sessions"), () => HttpResponse.json({ data: null })),
      http.get(api("/me/2fa"), () => HttpResponse.json({ data: { enabled: true } })),
      http.post(api("/me/2fa/backup-codes"), () => HttpResponse.json({ data: ["x"] })),
    );
    expect(await repo.devices()).toEqual([]);
    expect((await repo.mfa()).backup_codes_left).toBe(0);
    expect(await repo.mfaBackupCodes("1")).toEqual(["x"]);
  });
  it("followed tags with data, toggles, user lists", async () => {
    seen.length = 0;
    const list = () => HttpResponse.json({ data: [u], meta: {} });
    server.use(
      http.get(api("/me/tags"), () => HttpResponse.json({ data: ["a"] })),
      http.all(api("/tags/a/follow"), rec("tag")),
      http.all(api("/users/b%20c/block"), rec("block")),
      http.all(api("/users/b%20c/mute"), rec("mute")),
      http.all(api("/users/b%20c/subscribe"), rec("sub")),
      http.get(api("/me/blocks"), list),
      http.get(api("/me/mutes"), list),
      http.get(api("/users/b%20c/followers"), list),
      http.get(api("/users/b%20c/following"), list),
    );
    expect(await repo.followedTags()).toEqual(["a"]);
    for (const fn of [repo.followTag.bind(null, "a"), repo.block.bind(null, "b c"), repo.mute.bind(null, "b c"), repo.subscribe.bind(null, "b c")]) {
      await fn(true);
      await fn(false);
    }
    expect(seen.filter((s) => s.startsWith("DELETE"))).toHaveLength(4);
    expect((await repo.blocks({})).items).toHaveLength(1);
    expect((await repo.mutes({})).items).toHaveLength(1);
    expect((await repo.followers("b c", {})).items).toHaveLength(1);
    expect((await repo.following("b c", {})).items).toHaveLength(1);
  });
});

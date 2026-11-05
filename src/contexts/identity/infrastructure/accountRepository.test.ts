import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { api, server } from "@/test/server";
import { accountRepository } from "./accountRepository";

const user = { id: 1, username: "ali", created_at: "2026-01-01T00:00:00Z" };

describe("accountRepository", () => {
  it("register posts the form and returns a session", async () => {
    server.use(
      http.post(api("/auth/register"), async ({ request }) => {
        expect(await request.json()).toEqual({ username: "ali", email: "a@b.co", password: "12345678" });
        return HttpResponse.json({ data: { token: "t", expires_at: "x", user } }, { status: 201 });
      }),
    );
    expect((await accountRepository.register({ username: "ali", email: "a@b.co", password: "12345678" })).token).toBe("t");
  });
  it("surfaces problem details", async () => {
    server.use(http.post(api("/auth/login"), () => HttpResponse.json({ status: 401, detail: "invalid login or password" }, { status: 401 })));
    await expect(accountRepository.login({ login: "a", password: "b" })).rejects.toThrow("invalid login or password");
  });
  it("logout never throws", async () => {
    server.use(http.post(api("/auth/logout"), () => HttpResponse.error()));
    await expect(accountRepository.logout()).resolves.toBeUndefined();
  });
});

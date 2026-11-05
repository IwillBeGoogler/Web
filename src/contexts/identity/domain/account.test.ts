import { describe, expect, it } from "vitest";
import { displayName, initials, loginResultSchema, registerInputSchema } from "./account";

const user = { id: 1, username: "ali", created_at: "2026-01-01T00:00:00Z" };

describe("account", () => {
  it("login answers a session or an MFA challenge", () => {
    expect(loginResultSchema.parse({ token: "t", expires_at: "x", user }).kind).toBe("session");
    expect(loginResultSchema.parse({ mfa_required: true, mfa_token: "m" })).toEqual({ kind: "mfa", mfaToken: "m" });
  });
  it("register rules match the server", () => {
    const ok = { username: "ali_1", email: "a@b.co", password: "12345678" };
    expect(registerInputSchema.safeParse(ok).success).toBe(true);
    expect(registerInputSchema.safeParse({ ...ok, username: "al" }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...ok, username: "a-b-c" }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...ok, email: "nope" }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
    expect(registerInputSchema.safeParse({ ...ok, password: "ж".repeat(37) }).success).toBe(false);
  });
  it("display name falls back to username; initials", () => {
    expect(displayName({ username: "ali", display_name: "" })).toBe("ali");
    expect(displayName({ username: "ali", display_name: "Ali Valiyev" })).toBe("Ali Valiyev");
    expect(initials("Ali Valiyev")).toBe("AV");
    expect(initials("ali")).toBe("A");
    expect(initials("")).toBe("?");
  });
});

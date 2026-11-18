import { describe, expect, it } from "vitest";
import { parseSsoFragment } from "./SsoCallback";

describe("parseSsoFragment", () => {
  it("reads the token and expiry", () => {
    expect(parseSsoFragment("#token=abc&expires_at=2030-01-01T00%3A00%3A00Z")).toEqual({ token: "abc", expiresAt: "2030-01-01T00:00:00Z" });
    expect(parseSsoFragment("#access_token=acc&refresh_token=ref")).toEqual({
      token: "acc",
      expiresAt: "",
      refreshToken: "ref",
      refreshExpiresAt: "",
    });
    expect(parseSsoFragment("#access_token=acc&expires_at=e1&refresh_token=ref&refresh_expires_at=re1")).toEqual({
      token: "acc",
      expiresAt: "e1",
      refreshToken: "ref",
      refreshExpiresAt: "re1",
    });
  });
  it("reads an error code, defaulting to failed", () => {
    expect(parseSsoFragment("#error=domain")).toEqual({ error: "domain" });
    expect(parseSsoFragment("")).toEqual({ error: "failed" });
  });
});

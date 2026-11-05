import { describe, expect, it } from "vitest";
import { backupCodesSchema, codeSchema, describeDevice, groupSecret, passwordChangeSchema, resetSchema } from "./account";

describe("account rules", () => {
  it("password change: new differs, confirm matches, 8+ bytes", () => {
    const ok = { old_password: "oldpass1", new_password: "newpass12", confirm: "newpass12" };
    expect(passwordChangeSchema.safeParse(ok).success).toBe(true);
    expect(passwordChangeSchema.safeParse({ ...ok, confirm: "x" }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ ...ok, new_password: "short", confirm: "short" }).success).toBe(false);
    expect(passwordChangeSchema.safeParse({ ...ok, new_password: "oldpass1", confirm: "oldpass1" }).success).toBe(false);
  });
  it("reset needs matching passwords", () => {
    expect(resetSchema.safeParse({ password: "12345678", confirm: "12345678" }).success).toBe(true);
    expect(resetSchema.safeParse({ password: "12345678", confirm: "1234567" }).success).toBe(false);
  });
  it("codes and secrets", () => {
    expect(codeSchema.safeParse(" 123456 ").success).toBe(true);
    expect(codeSchema.safeParse("12").success).toBe(false);
    expect(groupSecret("ABCDEFGHIJ")).toBe("ABCD EFGH IJ");
    expect(backupCodesSchema.parse(["a", "b"])).toEqual({ backup_codes: ["a", "b"] });
    expect(backupCodesSchema.parse({ backup_codes: ["a"] })).toEqual({ backup_codes: ["a"] });
  });
  it("describes devices", () => {
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36")).toBe("Chrome on macOS");
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Version/17.0 Mobile Safari/604.1")).toBe("Safari on iOS");
    expect(describeDevice("curl/8.7.1")).toBe("curl");
    expect(describeDevice("")).toBe("Unknown device");
  });
});

import { describe, expect, it } from "vitest";
import { i18n } from "@/shared/i18n";
import { explainError } from "./explain";
import { ApiError, ContractError, NetworkError } from "./problem";

const t = i18n.t;
const post = { method: "POST", path: "/api/posts" };
const get = { method: "GET", path: "/api/posts" };

describe("explainError", () => {
  it("explains a lost connection and makes it reportable", () => {
    const x = explainError(new NetworkError(post, new TypeError("Failed to fetch")), t);
    expect(x.text).toBe(t("err.network"));
    expect(x.text).not.toContain(t("err.notSaved"));
    expect(x).toMatchObject({ reportable: true, detail: "Network error POST /api/posts" });
  });

  it("5xx: server text, reference code, never claims anything about saving", () => {
    const x = explainError(new ApiError(503, { detail: "pq: secret", request_id: "abcdef123456" }, post), t);
    expect(x.text).toBe(t("err.server"));
    expect(x.ref).toBe("abcdef12");
    expect(x.reportable).toBe(true);
    expect(x.detail).toBe("HTTP 503 POST /api/posts [request abcdef123456]");
  });

  it.each([
    [401, "err.session"],
    [403, "err.forbidden"],
    [404, "err.notFound"],
    [429, "err.rateLimit"],
  ] as const)("%i: mapped text, not reportable; says not saved only for writes", (status, key) => {
    expect(explainError(new ApiError(status, { detail: "server words" }, get), t)).toMatchObject({ text: t(key), reportable: false });
    expect(explainError(new ApiError(status, {}, post), t).text).toBe(`${t(key)} ${t("err.notSaved")}`);
    expect(explainError(new ApiError(status), t).text).toBe(t(key));
  });

  it.each([
    [401, "INVALID_CREDENTIALS"],
    [403, "EMAIL_NOT_VERIFIED"],
  ])("%i %s keeps the server's message", (status, code) => {
    const x = explainError(new ApiError(status, { code, detail: "exact words" }, post), t);
    expect(x).toMatchObject({ text: "exact words", reportable: false });
  });

  it.each([400, 409, 422])("%i keeps the server's validation message", (status) => {
    const x = explainError(new ApiError(status, { detail: "title is too short" }, post), t);
    expect(x).toMatchObject({ text: "title is too short", reportable: false });
  });

  it("a 4xx without a message falls back to the unknown text", () => {
    expect(explainError(new ApiError(400), t)).toMatchObject({ text: t("err.unknown"), reportable: true });
  });

  it("unknown failures never leak a stack", () => {
    const err = new ContractError("/x", []);
    const x = explainError(err, t);
    expect(x.text).toBe(t("err.unknown"));
    expect(x.reportable).toBe(true);
    expect(x.detail).not.toContain("\n");
    expect(explainError("boom", t).detail).toBe("boom");
  });
});

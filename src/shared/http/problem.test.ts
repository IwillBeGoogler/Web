import { describe, expect, it } from "vitest";
import { ApiError, ContractError, errorMessage, isApiError, NetworkError } from "./problem";

describe("ApiError", () => {
  it("prefers detail, then title, then the status", () => {
    expect(new ApiError(400, { detail: "d", title: "t" }).message).toBe("d");
    expect(new ApiError(400, { title: "t" }).message).toBe("t");
    expect(new ApiError(502).message).toBe("HTTP 502");
  });
  it("exposes problem fields and request info", () => {
    const e = new ApiError(409, { code: "X", numeric_code: 7, request_id: "r1" }, { method: "GET", path: "/a" });
    expect(e).toMatchObject({ name: "ApiError", status: 409, code: "X", numericCode: 7, requestId: "r1", request: { method: "GET", path: "/a" } });
  });
  it.each([
    [409, "isConflict"],
    [401, "isUnauthorized"],
    [403, "isForbidden"],
    [404, "isNotFound"],
  ] as const)("%i sets only %s", (status, flag) => {
    const e = new ApiError(status);
    for (const k of ["isConflict", "isUnauthorized", "isForbidden", "isNotFound"] as const) expect(e[k]).toBe(k === flag);
  });
});

describe("other errors and helpers", () => {
  it("NetworkError and ContractError carry context", () => {
    const n = new NetworkError({ method: "POST", path: "/x" }, "why");
    expect(n.message).toBe("Network error: POST /x");
    expect(n.cause).toBe("why");
    const c = new ContractError("/y", []);
    expect(c).toMatchObject({ name: "ContractError", message: "Unexpected response from /y", issues: [] });
  });
  it("isApiError narrows", () => {
    expect(isApiError(new ApiError(500))).toBe(true);
    expect(isApiError(new Error("x"))).toBe(false);
  });
  it("errorMessage covers api errors, errors and anything else", () => {
    expect(errorMessage(new ApiError(500, { detail: "bad", request_id: "r" }))).toBe("bad (request r)");
    expect(errorMessage(new ApiError(500, { detail: "bad" }))).toBe("bad");
    expect(errorMessage(new Error("plain"))).toBe("plain");
    expect(errorMessage(12)).toBe("12");
  });
});

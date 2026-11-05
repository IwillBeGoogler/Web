import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, NetworkError } from "@/shared/http";
import { i18n } from "@/shared/i18n";

const sonner = vi.hoisted(() => Object.assign(vi.fn(), { error: vi.fn() }));
vi.mock("sonner", () => ({ toast: sonner }));

import { setErrorReporter, toast } from "./toast";

const opts = () => sonner.error.mock.calls.at(-1)?.[1] as { action?: { label: string; onClick: () => void }; description?: string };

describe("toast.error", () => {
  const report = vi.fn();
  beforeEach(() => {
    sonner.error.mockClear();
    report.mockClear();
    setErrorReporter(report);
  });

  it("offers Report on 5xx with a reference, and hands over status + path only", () => {
    toast.error(new ApiError(500, { request_id: "abcdef123456" }, { method: "POST", path: "/api/posts" }));
    expect(opts().description).toBe(i18n.t("err.ref", { id: "abcdef12" }));
    opts().action?.onClick();
    expect(report).toHaveBeenCalledWith("HTTP 500 POST /api/posts [request abcdef123456]");
  });

  it("offers Report on network failures", () => {
    toast.error(new NetworkError({ method: "GET", path: "/api/x" }));
    expect(opts().action?.label).toBe(i18n.t("err.report"));
  });

  it("no action for 4xx the user can fix", () => {
    toast.error(new ApiError(422, { detail: "bad" }, { method: "POST", path: "/api/x" }));
    expect(sonner.error.mock.calls.at(-1)?.[0]).toBe("bad");
    expect(opts().action).toBeUndefined();
  });

  it("no action for plain strings, which is how the feedback failure is shown", () => {
    toast.error("Could not send");
    expect(opts().action).toBeUndefined();
  });
});

import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { renderRouted } from "@/test/render";
import { markSsoStarted, SsoCallbackPage, takeSsoStarted } from "./SsoCallback";

afterEach(() => {
  tokens.set(null);
  sessionStorage.clear();
  window.history.replaceState(null, "", "/");
  vi.restoreAllMocks();
});

describe("sso started marker", () => {
  it("accepts once, then refuses", () => {
    markSsoStarted();
    expect(takeSsoStarted()).toBe(true);
    expect(takeSsoStarted()).toBe(false);
  });
  it("refuses an expired marker", () => {
    markSsoStarted();
    expect(takeSsoStarted(Date.now() + 11 * 60 * 1000)).toBe(false);
  });
  it("tolerates blocked storage", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => markSsoStarted()).not.toThrow();
    expect(takeSsoStarted()).toBe(false);
  });
});

describe("SsoCallbackPage", () => {
  it("stores the token and goes home", async () => {
    markSsoStarted();
    window.history.replaceState(null, "", "/sso#token=abc&expires_at=2030-01-01T00%3A00%3A00Z");
    const { router } = await renderRouted(<SsoCallbackPage />, { path: "/sso" });
    await waitFor(() => expect(tokens.get()?.token).toBe("abc"));
    expect(window.location.hash).toBe("");
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
  });

  it("refuses a token nobody asked for", async () => {
    window.history.replaceState(null, "", "/sso#token=evil");
    await renderRouted(<SsoCallbackPage />, { path: "/sso" });
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(tokens.get()).toBeNull();
    expect(screen.getByRole("link")).toHaveAttribute("href", "/");
  });

  it("shows known and unknown errors", async () => {
    window.history.replaceState(null, "", "/sso#error=unverified");
    const a = await renderRouted(<SsoCallbackPage />, { path: "/sso" });
    const unverified = (await screen.findByRole("alert")).textContent;
    a.unmount();
    window.history.replaceState(null, "", "/sso#error=whatever");
    await renderRouted(<SsoCallbackPage />, { path: "/sso" });
    const failed = (await screen.findByRole("alert")).textContent;
    expect(unverified).not.toBe(failed);
  });
});

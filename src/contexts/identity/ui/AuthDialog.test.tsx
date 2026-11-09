import { act, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { authDialog } from "../application/authDialog";
import { AuthDialog } from "./AuthDialog";

vi.mock("@/shared/ui/turnstile", () => ({
  Turnstile: ({ onToken }: { onToken: (t: string) => void }) => (
    <>
      <button type="button" onClick={() => onToken("cap")}>
        solve
      </button>
      <button type="button" onClick={() => onToken("")}>
        expire
      </button>
    </>
  ),
}));

const user = { id: 1, username: "ali", created_at: "x" };

describe("AuthDialog", () => {
  it("signs in and closes", async () => {
    server.use(http.post(api("/auth/login"), () => HttpResponse.json({ data: { token: "tok", expires_at: "x", user } })));
    const { user: u } = await renderRouted(<AuthDialog />);
    act(() => authDialog.open("signin"));
    expect(await screen.findByText("Sign in to IWillBeGoogler")).toBeInTheDocument();
    await u.type(screen.getByLabelText("Email or username"), "ali");
    await u.type(screen.getByLabelText("Password"), "secret");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(authDialog.get()).toBeNull());
    expect(tokens.get()?.token).toBe("tok");
    tokens.set(null);
  });

  it("validates sign up locally and shows server errors", async () => {
    server.use(http.post(api("/auth/register"), () => HttpResponse.json({ status: 409, detail: "username taken" }, { status: 409 })));
    const { user: u } = await renderRouted(<AuthDialog />);
    act(() => authDialog.open("signup"));
    await u.click(await screen.findByRole("button", { name: "Sign up" }));
    expect(await screen.findByText("3–32 letters, digits or _")).toBeInTheDocument();
    await u.type(screen.getByLabelText("Username"), "ali");
    await u.type(screen.getByLabelText("Email"), "a@b.co");
    await u.type(screen.getByLabelText("Password"), "12345678");
    await u.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("username taken");
    act(() => authDialog.close());
  });

  it("switches to two-factor when asked", async () => {
    server.use(
      http.post(api("/auth/login"), () => HttpResponse.json({ data: { mfa_required: true, mfa_token: "m" } })),
      http.post(api("/auth/login/2fa"), () => HttpResponse.json({ data: { token: "t2", expires_at: "x", user } })),
    );
    const { user: u } = await renderRouted(<AuthDialog />);
    act(() => authDialog.open());
    await u.type(await screen.findByLabelText("Email or username"), "ali");
    await u.type(screen.getByLabelText("Password"), "p");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    await u.type(await screen.findByLabelText("Authentication code"), "123456");
    await u.click(screen.getByRole("button", { name: "Verify" }));
    await waitFor(() => expect(tokens.get()?.token).toBe("t2"));
    tokens.set(null);
  });

  it("offers only the social logins the server enables, on sign in and sign up", async () => {
    server.use(http.get(api("/config"), () => HttpResponse.json({ data: { sso: { google: { enabled: true }, github: { enabled: false } } } })));
    await renderRouted(<AuthDialog />);
    act(() => authDialog.open("signin"));
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/api/auth/oauth/google/login");
    expect(screen.queryByRole("link", { name: "Continue with GitHub" })).toBeNull();
    act(() => authDialog.open("signup"));
    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeInTheDocument();
    act(() => authDialog.close());
  });

  it("shows no social buttons by default", async () => {
    server.use(http.get(api("/config"), () => HttpResponse.json({ data: { captcha_site_key: "" } })));
    await renderRouted(<AuthDialog />);
    act(() => authDialog.open("signin"));
    expect(await screen.findByText("Sign in to IWillBeGoogler")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Continue with/ })).toBeNull();
    act(() => authDialog.close());
  });

  it("requires captcha when a site key is set, then registers with honeypot empty", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.get(api("/config"), () => HttpResponse.json({ data: { captcha_site_key: "k" } })),
      http.post(api("/auth/register"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { token: "r", expires_at: "x", user } });
      }),
    );
    const { user: u } = await renderRouted(<AuthDialog />);
    act(() => authDialog.open("signup"));
    await u.type(await screen.findByLabelText("Username"), "ali");
    await u.type(screen.getByLabelText("Email"), "a@b.co");
    await u.type(screen.getByLabelText("Password"), "12345678");
    const solve = await screen.findByRole("button", { name: "solve" });
    await u.click(screen.getByRole("button", { name: "Sign up" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await u.click(solve);
    await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
    const hp = document.querySelector('input[name="website"]') as HTMLInputElement;
    await u.type(hp, "bot");
    await u.click(screen.getByRole("button", { name: "Sign up" }));
    await waitFor(() => expect(authDialog.get()).toBeNull());
    expect(body).toMatchObject({ captcha_token: "cap", website: "bot" });
    tokens.set(null);
  });

  it("clears captcha missing flag only on non-empty token and keeps state", async () => {
    server.use(http.get(api("/config"), () => HttpResponse.json({ data: { captcha_site_key: "k" } })));
    const { user: u } = await renderRouted(<AuthDialog />);
    act(() => authDialog.open("signup"));
    await u.click(await screen.findByRole("button", { name: "expire" }));
    expect(screen.queryByRole("alert")).toBeNull();
    act(() => authDialog.close());
  });

  it("shows mfa error, forgot link, terms link, lens switch and close", async () => {
    server.use(
      http.post(api("/auth/login"), () => HttpResponse.json({ data: { mfa_required: true, mfa_token: "m" } })),
      http.post(api("/auth/login/2fa"), () => HttpResponse.json({ status: 401, detail: "bad code" }, { status: 401 })),
    );
    const { user: u, router } = await renderRouted(<AuthDialog />);
    act(() => authDialog.open("signin"));
    await u.click(await screen.findByRole("tab", { name: "Create one" }).catch(() => screen.findByText("Create one")));
    expect(authDialog.get()).toBe("signup");
    await u.click(screen.getByText("Sign in", { selector: "[role=tab], button" }));
    await u.type(await screen.findByLabelText("Email or username"), "ali");
    await u.type(screen.getByLabelText("Password"), "p");
    await u.click(screen.getByRole("button", { name: "Sign in" }));
    await u.type(await screen.findByLabelText("Authentication code"), "123456");
    await u.click(screen.getByRole("button", { name: "Verify" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    act(() => authDialog.close());
    act(() => authDialog.open("signin"));
    await u.click(await screen.findByRole("link", { name: /forgot/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/forgot-password"));
    expect(authDialog.get()).toBeNull();
    act(() => authDialog.open("signin"));
    await u.click(await screen.findByRole("link", { name: /terms/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/terms"));
    act(() => authDialog.open("signin"));
    await u.click(await screen.findByRole("link", { name: /privacy/i }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/privacy"));
    act(() => authDialog.open("signin"));
    await u.click(await screen.findByRole("button", { name: /close/i }));
    expect(authDialog.get()).toBeNull();
  });

  it("marks sso started when a social link is clicked", async () => {
    server.use(http.get(api("/config"), () => HttpResponse.json({ data: { sso: { github: { enabled: true } } } })));
    const { user: u } = await renderRouted(<AuthDialog />);
    act(() => authDialog.open("signin"));
    const link = await screen.findByRole("link", { name: "Continue with GitHub" });
    link.addEventListener("click", (e) => e.preventDefault());
    await u.click(link);
    expect(sessionStorage.getItem("iwillbegoogler.sso.pending")).not.toBeNull();
    sessionStorage.clear();
    act(() => authDialog.close());
  });
});

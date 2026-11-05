import { act, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { tokens } from "@/shared/api";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { authDialog } from "../application/authDialog";
import { AuthDialog } from "./AuthDialog";

const user = { id: 1, username: "ali", created_at: "x" };

describe("AuthDialog", () => {
  it("signs in and closes", async () => {
    server.use(http.post(api("/auth/login"), () => HttpResponse.json({ data: { token: "tok", expires_at: "x", user } })));
    const { user: u } = await renderRouted(<AuthDialog />);
    act(() => authDialog.open("signin"));
    expect(await screen.findByText("Sign in to iBlog")).toBeInTheDocument();
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
    expect(await screen.findByText("Sign in to iBlog")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Continue with/ })).toBeNull();
    act(() => authDialog.close());
  });
});

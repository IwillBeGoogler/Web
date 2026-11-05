import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { ForgotPasswordPage, ResetPasswordPage, UnsubscribePage, VerifyEmailPage } from "./AuthPages";

describe("auth link pages", () => {
  it("forgot password always confirms", async () => {
    server.use(http.post(api("/auth/forgot-password"), () => new HttpResponse(null, { status: 202 })));
    const { user } = await renderRouted(<ForgotPasswordPage />);
    await user.type(screen.getByLabelText("Email"), "a@b.co");
    await user.click(screen.getByRole("button", { name: /Send reset link/ }));
    expect(await screen.findByText("Check your inbox")).toBeInTheDocument();
  });
  it("reset validates and posts the token", async () => {
    const hit = vi.fn(async ({ request }: { request: Request }) => {
      expect(await request.json()).toEqual({ token: "tk", password: "newpass12" });
      return new HttpResponse(null, { status: 204 });
    });
    server.use(http.post(api("/auth/reset-password"), hit));
    const { user } = await renderRouted(<ResetPasswordPage token="tk" />);
    await user.type(screen.getByLabelText("New password"), "newpass12");
    await user.type(screen.getByLabelText("Confirm password"), "nope");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByText("Passwords don't match")).toBeInTheDocument();
    await user.clear(screen.getByLabelText("Confirm password"));
    await user.type(screen.getByLabelText("Confirm password"), "newpass12");
    await user.click(screen.getByRole("button", { name: "Set password" }));
    expect(await screen.findByText("Password changed")).toBeInTheDocument();
  });
  it("verifies email from the link", async () => {
    server.use(http.post(api("/auth/verify-email"), () => new HttpResponse(null, { status: 204 })));
    await renderRouted(<VerifyEmailPage code="c" />);
    expect(await screen.findByText("Email verified")).toBeInTheDocument();
  });
  it("reports a dead verification link", async () => {
    server.use(http.post(api("/auth/verify-email"), () => HttpResponse.json({ detail: "expired" }, { status: 400 })));
    await renderRouted(<VerifyEmailPage code="c" />);
    expect(await screen.findByText("This link doesn't work")).toBeInTheDocument();
  });
  it("unsubscribes", async () => {
    server.use(http.post(api("/unsubscribe"), () => new HttpResponse(null, { status: 204 })));
    await renderRouted(<UnsubscribePage s="1" a="2" sig="x" />);
    expect(await screen.findByText("You're unsubscribed")).toBeInTheDocument();
  });
});

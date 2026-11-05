import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { tokens } from "@/shared/api";
import { signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { Settings } from "./Settings";

const user = { id: 3, username: "admin", created_at: "x" };

describe("Settings", () => {
  it("changes the password and stores the new token", async () => {
    signIn();
    server.use(
      http.put(api("/me/password"), () => HttpResponse.json({ data: { token: "fresh", expires_at: "x", user } })),
      http.get(api("/me/2fa"), () => HttpResponse.json({ data: { enabled: false } })),
      http.get(api("/me/sessions"), () =>
        HttpResponse.json({
          data: [{ id: "s1", user_agent: "curl/8", ip: "1.1.1.1", created_at: "2026-10-05T00:00:00Z", last_seen_at: "2026-10-05T00:00:00Z", current: true }],
        }),
      ),
    );
    const { user: u } = await renderRouted(<Settings tab="security" onTab={() => {}} />);
    await u.type(screen.getByLabelText("Current password"), "oldpass12");
    await u.type(screen.getByLabelText("New password"), "newpass12");
    await u.type(screen.getByLabelText("Confirm new password"), "newpass12");
    await u.click(screen.getByRole("button", { name: "Change password" }));
    await waitFor(() => expect(tokens.get()?.token).toBe("fresh"));
    expect(await screen.findByText("This device")).toBeInTheDocument();
    tokens.set(null);
  });

  it("sets up two-factor and shows backup codes", async () => {
    signIn();
    let enabled = false;
    server.use(
      http.get(api("/me/2fa"), () => HttpResponse.json({ data: { enabled, backup_codes_left: enabled ? 10 : 0 } })),
      http.get(api("/me/sessions"), () => HttpResponse.json({ data: [] })),
      http.post(api("/me/2fa/setup"), () =>
        HttpResponse.json({ data: { secret: "JBSWY3DPEHPK3PXP", otpauth_url: "otpauth://totp/Blog:admin?secret=JBSWY3DPEHPK3PXP" } }),
      ),
      http.post(api("/me/2fa/enable"), () => {
        enabled = true;
        return HttpResponse.json({ data: { backup_codes: ["aaaa-bbbb", "cccc-dddd"] } });
      }),
    );
    const { user: u } = await renderRouted(<Settings tab="security" onTab={() => {}} />);
    await u.click(await screen.findByRole("button", { name: "Set up two-factor authentication" }));
    expect(await screen.findByText("JBSW Y3DP EHPK 3PXP")).toBeInTheDocument();
    await u.type(screen.getByLabelText("Code from the app"), "123456");
    await u.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("aaaa-bbbb")).toBeInTheDocument();
    expect(await screen.findByText(/10 backup codes left/)).toBeInTheDocument();
    tokens.set(null);
  });

  it("lists followed topics and blocked people", async () => {
    signIn();
    server.use(
      http.get(api("/me/tags"), () => HttpResponse.json({ data: ["go"] })),
      http.get(api("/me/blocks"), () => HttpResponse.json({ data: [{ id: 9, username: "troll" }], meta: {} })),
      http.get(api("/me/mutes"), () => HttpResponse.json({ data: [], meta: {} })),
      http.get(api("/me/hidden"), () => HttpResponse.json({ data: [], meta: {} })),
    );
    await renderRouted(<Settings tab="privacy" onTab={() => {}} />);
    expect(await screen.findByRole("button", { name: "Unfollow go" })).toBeInTheDocument();
    expect(await screen.findByText("troll")).toBeInTheDocument();
    tokens.set(null);
  });
});

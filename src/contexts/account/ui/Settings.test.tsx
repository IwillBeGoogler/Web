import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { meKey } from "@/contexts/identity/application/session";
import { readingPrefs } from "@/contexts/preferences/application/store";
import { tokens } from "@/shared/api";
import { toast } from "@/shared/ui/toast";
import { signIn } from "@/test/fixtures";
import { renderRouted, testQueryClient } from "@/test/render";
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

const json = (data: unknown) => HttpResponse.json({ data });
const sess = (o: Record<string, unknown>) => ({
  id: "s",
  user_agent: "",
  ip: "",
  created_at: "2026-10-05T00:00:00Z",
  last_seen_at: "2026-10-05T00:00:00Z",
  current: false,
  ...o,
});

const withMe = (u: Record<string, unknown>) => {
  const qc = testQueryClient();
  qc.setQueryData(meKey, u);
  return qc;
};

describe("Settings profile", () => {
  it("shows unverified banner, resends, saves and removes avatar", async () => {
    signIn();
    server.use(
      http.get(api("/me"), () =>
        json({ id: 3, username: "admin", email: "a@x.dev", display_name: "Admin", bio: "hi", avatar_url: "http://x/a.png", created_at: "x" }),
      ),
      http.post(api("/me/verify-email"), () => json({})),
      http.patch(api("/me"), () => json({ id: 3, username: "admin", display_name: "New", created_at: "x" })),
    );
    const qc = withMe({ id: 3, username: "admin", email: "a@x.dev", display_name: "Admin", bio: "hi", avatar_url: "http://x/a.png", created_at: "x" });
    const { user: u } = await renderRouted(<Settings tab="profile" onTab={() => {}} />, { qc });
    await u.click(await screen.findByRole("button", { name: "Resend link" }));
    expect(await screen.findByText("Verification email sent")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Remove" }));
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
    await u.type(screen.getByLabelText("Name"), "x");
    await u.type(screen.getByLabelText("Short bio"), "y");
    await u.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Profile saved")).toBeInTheDocument();
    tokens.set(null);
  });

  it("resend failure toasts error", async () => {
    signIn();
    server.use(http.post(api("/me/verify-email"), () => HttpResponse.json({ status: 500, detail: "boom" }, { status: 500 })));
    const err = vi.spyOn(toast, "error").mockImplementation(() => undefined as never);
    const qc = withMe({ id: 3, username: "admin", email: "", display_name: "A", bio: "", avatar_url: "", created_at: "x" });
    const { user: u } = await renderRouted(<Settings tab="profile" onTab={() => {}} />, { qc });
    await u.click(await screen.findByRole("button", { name: "Resend link" }));
    await waitFor(() => expect(err).toHaveBeenCalled());
    err.mockRestore();
    tokens.set(null);
  });

  it("uploads photo, rejects big file, handles failure and empty selection", async () => {
    signIn();
    server.use(
      http.get(api("/me"), () =>
        json({ id: 3, username: "admin", email: "", display_name: "", bio: "", avatar_url: "", email_verified: true, created_at: "x" }),
      ),
      http.post(api("/uploads"), () => json({ url: "http://x/new.png" })),
    );
    const qc = withMe({ id: 3, username: "admin", email: "", display_name: "", bio: "", avatar_url: "", email_verified: true, created_at: "x" });
    const { user: u, container } = await renderRouted(<Settings tab="profile" onTab={() => {}} />, { qc });
    await screen.findByText("Upload photo");
    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(input, "files", { value: [], configurable: true });
    fireEvent.change(input);
    delete (input as { files?: unknown }).files;
    const big = new File(["x"], "big.png", { type: "image/png" });
    Object.defineProperty(big, "size", { value: 6 * 1024 * 1024 });
    Object.defineProperty(input, "files", { value: [big], configurable: true });
    fireEvent.change(input);
    delete (input as { files?: unknown }).files;
    expect(await screen.findByText("Image must be 5 MB or smaller.")).toBeInTheDocument();
    await u.upload(input, new File(["x"], "a.png", { type: "image/png" }));
    expect(await screen.findByRole("button", { name: "Remove" })).toBeInTheDocument();
    const err = vi.spyOn(toast, "error").mockImplementation(() => undefined as never);
    server.use(http.post(api("/uploads"), () => HttpResponse.json({ status: 400, detail: "bad file" }, { status: 400 })));
    await u.upload(input, new File(["x"], "b.png", { type: "image/png" }));
    await waitFor(() => expect(err).toHaveBeenCalled());
    err.mockRestore();
    tokens.set(null);
  });

  it("renders nothing when signed out", async () => {
    tokens.set(null);
    const { container } = await renderRouted(<Settings tab="profile" onTab={() => {}} />);
    expect(container.querySelector("form")).toBeNull();
  });
});

describe("Settings security extras", () => {
  it("shows password server error", async () => {
    signIn();
    server.use(
      http.put(api("/me/password"), () => HttpResponse.json({ status: 400, detail: "wrong password" }, { status: 400 })),
      http.get(api("/me/2fa"), () => json({ enabled: false })),
      http.get(api("/me/sessions"), () => json(null)),
    );
    const { user: u } = await renderRouted(<Settings tab="security" onTab={() => {}} />);
    await u.type(screen.getByLabelText("Current password"), "oldpass12");
    await u.type(screen.getByLabelText("New password"), "newpass12");
    await u.type(screen.getByLabelText("Confirm new password"), "newpass12");
    await u.click(screen.getByRole("button", { name: "Change password" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("wrong password");
    tokens.set(null);
  });

  it("2fa setup failure toasts; enable shows copy + clipboard paths", async () => {
    signIn();
    let fail = true;
    const err = vi.spyOn(toast, "error").mockImplementation(() => undefined as never);
    server.use(
      http.get(api("/me/2fa"), () => json({ enabled: false })),
      http.get(api("/me/sessions"), () => json([])),
      http.post(api("/me/2fa/setup"), () =>
        fail ? HttpResponse.json({ status: 500, detail: "nope" }, { status: 500 }) : json({ secret: "ABCD", otpauth_url: "otpauth://x" }),
      ),
      http.post(api("/me/2fa/enable"), () => json(["c1-c1", "c2-c2"])),
    );
    const { user: u } = await renderRouted(<Settings tab="security" onTab={() => {}} />);
    await u.click(await screen.findByRole("button", { name: "Set up two-factor authentication" }));
    await waitFor(() => expect(err).toHaveBeenCalled());
    err.mockRestore();
    fail = false;
    await u.click(screen.getByRole("button", { name: "Set up two-factor authentication" }));
    await u.type(await screen.findByLabelText("Code from the app"), "123456");
    await u.click(screen.getByRole("button", { name: "Turn on" }));
    await screen.findByText("c1-c1");
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await u.click(screen.getByRole("button", { name: "Copy codes" }));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    await u.click(screen.getByRole("button", { name: "Copy codes" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await u.click(screen.getByRole("button", { name: "Copy codes" }));
    tokens.set(null);
  });

  it("2fa enabled: regenerate codes and turn off", async () => {
    signIn();
    server.use(
      http.get(api("/me/2fa"), () => json({ enabled: true, backup_codes_left: 4 })),
      http.get(api("/me/sessions"), () => json([])),
      http.post(api("/me/2fa/backup-codes"), () => json({ backup_codes: ["n1-n1"] })),
      http.post(api("/me/2fa/disable"), () => json({})),
    );
    const { user: u } = await renderRouted(<Settings tab="security" onTab={() => {}} />);
    await screen.findByText(/4 backup codes left/);
    await u.type(screen.getByLabelText("Authenticator or backup code"), "123456");
    await u.click(screen.getByRole("button", { name: "New backup codes" }));
    expect(await screen.findByText("n1-n1")).toBeInTheDocument();
    await u.type(screen.getByLabelText("Authenticator or backup code"), "123456");
    await u.type(screen.getByLabelText("Password (to turn off)"), "pw");
    await u.click(screen.getByRole("button", { name: "Turn off two-factor" }));
    expect(await screen.findByText("Two-factor authentication is off")).toBeInTheDocument();
    tokens.set(null);
  });

  it("2fa enable error is shown", async () => {
    signIn();
    server.use(
      http.get(api("/me/2fa"), () => json({ enabled: false })),
      http.get(api("/me/sessions"), () => json([])),
      http.post(api("/me/2fa/setup"), () => json({ secret: "ABCD", otpauth_url: "otpauth://x" })),
      http.post(api("/me/2fa/enable"), () => HttpResponse.json({ status: 400, detail: "bad code" }, { status: 400 })),
    );
    const { user: u } = await renderRouted(<Settings tab="security" onTab={() => {}} />);
    await u.click(await screen.findByRole("button", { name: "Set up two-factor authentication" }));
    await u.type(await screen.findByLabelText("Code from the app"), "123456");
    await u.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("bad code");
    tokens.set(null);
  });

  it("devices: icons, revoke, sign out everywhere", async () => {
    signIn();
    let revoked = "";
    server.use(
      http.get(api("/me/2fa"), () => json({ enabled: false })),
      http.get(api("/me/sessions"), () =>
        json([
          sess({ id: "a", user_agent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) Mobile Safari", ip: "1.1.1.1" }),
          sess({ id: "b", user_agent: "Mozilla/5.0 (iPad; CPU OS 17_0) Safari" }),
          sess({ id: "c", user_agent: "curl/8" }),
          sess({ id: "d", user_agent: "Mozilla/5.0 (Windows NT 10.0) Chrome/120" }),
          sess({ id: "e", user_agent: "" }),
        ]),
      ),
      http.delete(api("/me/sessions/:id"), ({ params }) => {
        revoked = String(params.id);
        return json({});
      }),
      http.post(api("/auth/logout-all"), () => json({})),
    );
    const { user: u, router } = await renderRouted(<Settings tab="security" onTab={() => {}} />, { path: "/settings" });
    const outs = await screen.findAllByRole("button", { name: "Sign out" });
    await u.click(outs[0]);
    await waitFor(() => expect(revoked).toBe("a"));
    await u.click(screen.getByRole("button", { name: "Sign out everywhere" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    tokens.set(null);
  });
});

describe("Settings reading, privacy, account", () => {
  it("reading tab resets defaults", async () => {
    const reset = vi.spyOn(readingPrefs, "reset");
    const { user: u } = await renderRouted(<Settings tab="reading" onTab={() => {}} />);
    await u.click(await screen.findByRole("button", { name: "Reset to defaults" }));
    expect(reset).toHaveBeenCalled();
    reset.mockRestore();
  });

  it("tabs call onTab", async () => {
    const onTab = vi.fn();
    const { user: u } = await renderRouted(<Settings tab="reading" onTab={onTab} />);
    await u.click(screen.getByRole("tab", { name: "Privacy" }));
    expect(onTab).toHaveBeenCalledWith("privacy");
  });

  it("privacy: unfollow tag, undo hidden, unblock, unmute, empty states", async () => {
    signIn();
    const calls: string[] = [];
    server.use(
      http.get(api("/me/tags"), () => json(["go"])),
      http.delete(api("/tags/go/follow"), () => {
        calls.push("untag");
        return json({});
      }),
      http.get(api("/me/blocks"), () => json([{ id: 9, username: "troll", display_name: "Troll" }])),
      http.get(api("/me/mutes"), () => json([{ id: 8, username: "loud" }])),
      http.get(api("/me/hidden"), () =>
        json([
          { kind: "post", target: "p1", created_at: "x" },
          { kind: "author", target: "a1", created_at: "x" },
          { kind: "tag", target: "t1", created_at: "x" },
        ]),
      ),
      http.delete(api("/me/hidden/:kind/:t"), () => {
        calls.push("unhide");
        return json({});
      }),
      http.delete(api("/users/troll/block"), () => {
        calls.push("unblock");
        return json({});
      }),
      http.delete(api("/users/loud/mute"), () => {
        calls.push("unmute");
        return json({});
      }),
    );
    const { user: u } = await renderRouted(<Settings tab="privacy" onTab={() => {}} />);
    await u.click(await screen.findByRole("button", { name: "Unfollow go" }));
    await u.click((await screen.findAllByRole("button", { name: "Undo" }))[0]);
    await u.click(await screen.findByRole("button", { name: "Unblock" }));
    await u.click(await screen.findByRole("button", { name: "Unmute" }));
    await waitFor(() => expect(calls).toEqual(expect.arrayContaining(["untag", "unhide", "unblock", "unmute"])));
    expect(screen.getByText("Story")).toBeInTheDocument();
    expect(screen.getByText("Writer")).toBeInTheDocument();
    expect(screen.getByText("Topic")).toBeInTheDocument();
    tokens.set(null);
  });

  it("privacy empty states", async () => {
    signIn();
    server.use(
      http.get(api("/me/tags"), () => json([])),
      http.get(api("/me/blocks"), () => json([])),
      http.get(api("/me/mutes"), () => json([])),
      http.get(api("/me/hidden"), () => json([])),
    );
    await renderRouted(<Settings tab="privacy" onTab={() => {}} />);
    expect(await screen.findByText("Nothing hidden.")).toBeInTheDocument();
    expect(await screen.findByText("You haven't blocked anyone.")).toBeInTheDocument();
    expect(await screen.findByText("You haven't muted anyone.")).toBeInTheDocument();
    expect(screen.getByText("Add topics from any topic page.")).toBeInTheDocument();
    tokens.set(null);
  });

  it("delete account: success and error", async () => {
    signIn();
    let fail = true;
    server.use(http.delete(api("/me"), () => (fail ? HttpResponse.json({ status: 403, detail: "bad pw" }, { status: 403 }) : json({}))));
    const { user: u, router } = await renderRouted(<Settings tab="account" onTab={() => {}} />, { path: "/settings" });
    const btn = screen.getByRole("button", { name: "Delete account" });
    expect(btn).toBeDisabled();
    await u.type(screen.getByLabelText("Password"), "pw");
    await u.click(screen.getByRole("checkbox"));
    await u.click(btn);
    expect(await screen.findByRole("alert")).toHaveTextContent("bad pw");
    fail = false;
    await u.click(btn);
    expect(await screen.findByText("Account scheduled for deletion")).toBeInTheDocument();
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    tokens.set(null);
  });
});

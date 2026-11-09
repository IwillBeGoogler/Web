import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { SharePanel } from "./SharePanel";

const err500 = () => HttpResponse.json({ error: { code: "X", message: "boom" } }, { status: 500 });
const ok204 = () => new HttpResponse(null, { status: 204 });
const hasToast = () => waitFor(() => expect(document.querySelector("[data-sonner-toast]")).not.toBeNull());
const member = (o: Record<string, unknown> = {}) => ({ userId: "9", email: "bob@x.dev", name: "Bob", role: "editor", createdAt: 0, ...o });
const link = (o: Record<string, unknown> = {}) => ({ id: "s1", role: "viewer", createdAt: 0, ...o });

const members = (items: unknown[]) => server.use(http.get(api("/diagrams/projects/p1/members"), () => HttpResponse.json({ items })));
const shares = (items: unknown[]) => server.use(http.get(api("/diagrams/projects/p1/shares"), () => HttpResponse.json({ items })));

const open = (role = "owner", onLeft = vi.fn(), onOpenChange = vi.fn(), isOpen = true) =>
  renderRouted(<SharePanel projectId="p1" projectName="Payments" role={role as never} open={isOpen} onOpenChange={onOpenChange} onLeft={onLeft} />);

beforeEach(() => signIn());
afterEach(() => {
  tokens.set(null);
  vi.restoreAllMocks();
});

describe("SharePanel", () => {
  it("fetches nothing while closed", async () => {
    let hit = 0;
    server.use(http.get(api("/diagrams/projects/p1/members"), () => (hit++, HttpResponse.json({ items: [] }))));
    await open("owner", vi.fn(), vi.fn(), false);
    expect(hit).toBe(0);
  });

  it("shows a load error for the members", async () => {
    server.use(http.get(api("/diagrams/projects/p1/members"), err500));
    shares([]);
    await open();
    expect(await screen.findByText("Couldn't load this project.")).toBeInTheDocument();
  });

  it("lists people with email fallback, a (you) marker, fixed owner role and no links yet", async () => {
    members([member({ userId: String(me.id), name: "", email: me.email, role: "owner" }), member(), member({ userId: "10", name: "", email: "c@x.dev" })]);
    shares([]);
    await open();
    expect(await screen.findByText("(you)")).toBeInTheDocument();
    expect(screen.getByText("Bob")).toBeInTheDocument();
    expect(screen.getByText("bob@x.dev")).toBeInTheDocument();
    expect(screen.getByText("c@x.dev")).toBeInTheDocument();
    expect(screen.getByText("No links yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: `Remove ${me.email}` })).toBeNull();
  });

  it("changes a member role; errors toast", async () => {
    members([member()]);
    shares([]);
    let body: unknown;
    let fail = false;
    server.use(
      http.patch(api("/diagrams/projects/p1/members/9"), async ({ request }) => {
        body = await request.json();
        return fail ? err500() : ok204();
      }),
    );
    const { user } = await open();
    const sel = await screen.findByLabelText("Role of Bob");
    await user.selectOptions(sel, "viewer");
    await waitFor(() => expect(body).toEqual({ role: "viewer" }));
    fail = true;
    await user.selectOptions(sel, "editor");
    await hasToast();
  });

  it("removes a member; errors toast", async () => {
    members([member()]);
    shares([]);
    let fail = true;
    let hit = 0;
    server.use(http.delete(api("/diagrams/projects/p1/members/9"), () => (hit++, fail ? err500() : ok204())));
    const { user } = await open();
    await user.click(await screen.findByRole("button", { name: "Remove Bob" }));
    await hasToast();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Remove Bob" }));
    await waitFor(() => expect(hit).toBe(2));
  });

  it("invite: blank is ignored, success clears the field, failure toasts", async () => {
    members([]);
    shares([]);
    let fail = true;
    const bodies: unknown[] = [];
    server.use(
      http.post(api("/diagrams/projects/p1/members"), async ({ request }) => {
        bodies.push(await request.json());
        return fail ? err500() : HttpResponse.json({ member: member() }, { status: 201 });
      }),
    );
    const { user } = await open();
    const input = await screen.findByLabelText("Email or username");
    expect(screen.getByRole("button", { name: "Invite" })).toBeDisabled();
    await user.type(input, "  {Enter}");
    expect(bodies).toHaveLength(0);
    await user.type(input, "bob");
    await user.selectOptions(screen.getAllByLabelText("Role")[0] as HTMLElement, "commenter");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    await hasToast();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(input).toHaveValue(""));
    expect(bodies[0]).toEqual({ email: "bob", role: "commenter" });
  });

  it("creates a link with an expiry, copies it, shows it once, and lists dead links", async () => {
    members([]);
    shares([
      link({ id: "old", role: "editor", revokedAt: 5 }),
      link({ id: "gone", role: "viewer", expiresAt: 1 }),
      link({ id: "soon", role: "commenter", expiresAt: Date.now() + 86_400_000 }),
      link({ id: "s9" }),
    ]);
    let body: unknown;
    server.use(
      http.post(api("/diagrams/projects/p1/shares"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ share: link({ id: "s9" }), token: "tok123" }, { status: 201 });
      }),
    );
    const { user } = await open();
    const write = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue(undefined);
    expect(await screen.findByText("revoked")).toBeInTheDocument();
    expect(screen.getAllByText(/^expires/).length).toBeGreaterThan(0);
    await user.selectOptions(screen.getByLabelText("Expires"), "2");
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(write).toHaveBeenCalledWith(expect.stringContaining("/d/s/tok123")));
    expect(body).toEqual({ role: "viewer", expiresInSeconds: 7 * 86_400 });
    expect(await screen.findByDisplayValue(/\/d\/s\/tok123$/)).toBeInTheDocument();
    expect(screen.getByText("Copy it now: the link is shown only once.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    expect(write).toHaveBeenCalledTimes(2);
    const field = screen.getByDisplayValue(/tok123/);
    field.focus();
  });

  it("a clipboard failure toasts, and a failed create toasts", async () => {
    members([]);
    shares([link({ id: "s9" })]);
    let fail = false;
    server.use(
      http.post(api("/diagrams/projects/p1/shares"), () => (fail ? err500() : HttpResponse.json({ share: link({ id: "s9" }), token: "t" }, { status: 201 }))),
    );
    const { user } = await open();
    vi.spyOn(navigator.clipboard, "writeText").mockRejectedValue(new Error("denied"));
    await user.click(await screen.findByRole("button", { name: "Create link" }));
    await hasToast();
    fail = true;
    await user.click(screen.getByRole("button", { name: "Create link" }));
    await waitFor(() => expect(document.querySelectorAll("[data-sonner-toast]").length).toBeGreaterThan(1));
  });

  it("revokes a link; errors toast; changes the new-link role", async () => {
    members([]);
    shares([link()]);
    let fail = true;
    let hit = 0;
    server.use(http.delete(api("/diagrams/projects/p1/shares/s1"), () => (hit++, fail ? err500() : ok204())));
    const { user } = await open();
    await user.selectOptions(screen.getAllByLabelText("Role").at(-1) as HTMLElement, "editor");
    await user.click(await screen.findByRole("button", { name: "Revoke Viewer link" }));
    await hasToast();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Revoke Viewer link" }));
    await waitFor(() => expect(hit).toBe(2));
  });

  it("non-owners can leave; cancel keeps the dialog; failure toasts; success calls onLeft", async () => {
    members([member({ userId: String(me.id), name: "Admin", role: "viewer" })]);
    let fail = true;
    server.use(http.delete(api(`/diagrams/projects/p1/members/${me.id}`), () => (fail ? err500() : ok204())));
    const onLeft = vi.fn();
    const onOpenChange = vi.fn();
    const { user } = await open("viewer", onLeft, onOpenChange);
    await user.click(await screen.findByRole("button", { name: "Leave project" }));
    let d = within(await screen.findByRole("alertdialog").catch(() => screen.getAllByRole("dialog").at(-1) as HTMLElement));
    await user.click(d.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Leave project" }));
    d = within(screen.getAllByRole("dialog").at(-1) as HTMLElement);
    await user.click(d.getByRole("button", { name: "Leave project" }));
    await hasToast();
    fail = false;
    await user.click(d.getByRole("button", { name: "Leave project" }));
    await waitFor(() => expect(onLeft).toHaveBeenCalled());
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

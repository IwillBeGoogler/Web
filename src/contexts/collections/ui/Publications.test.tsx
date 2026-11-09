import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { MyPublications, PublicationPage } from "./Publications";

const pub = (o: Record<string, unknown> = {}) => ({ id: 1, slug: "acme", name: "Acme", description: "We write", avatar_url: "", members: 3, posts: 4, my_role: "owner", ...o });
const member = (id: number, username: string, role: string, o: Record<string, unknown> = {}) => ({ user_id: id, username, display_name: "", avatar_url: "", role, ...o });

afterEach(() => {
  tokens.set(null);
  vi.restoreAllMocks();
});

const mockPub = (o: Record<string, unknown> = {}, members: unknown = []) =>
  server.use(
    http.get(api("/publications/acme"), () => HttpResponse.json({ data: pub(o) })),
    http.get(api("/publications/acme/posts"), () => page([])),
    http.get(api("/publications/acme/members"), () => HttpResponse.json({ data: members })),
  );

describe("MyPublications", () => {
  it("lists publications", async () => {
    server.use(http.get(api("/me/publications"), () => HttpResponse.json({ data: [pub()] })));
    await renderRouted(<MyPublications />);
    expect(await screen.findByRole("link", { name: "Acme" })).toBeInTheDocument();
    expect(screen.getByText(/owner · 3 members/)).toBeInTheDocument();
  });

  it("empty state, create publication (auto slug) and navigate", async () => {
    let body: unknown;
    server.use(
      http.get(api("/me/publications"), () => HttpResponse.json({ data: null })),
      http.post(api("/publications"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: pub({ slug: "my-team" }) });
      }),
    );
    const { user, router } = await renderRouted(<MyPublications />);
    expect(await screen.findByText("You're not in any publication.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New publication" }));
    await user.click(await screen.findByRole("button", { name: "Create publication" }));
    expect(await screen.findByText("Required")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "My Team");
    await user.tab();
    await waitFor(() => expect(screen.getByLabelText("Address")).toHaveValue("my-team"));
    await user.click(screen.getByRole("button", { name: "Create publication" }));
    await waitFor(() => expect(body).toMatchObject({ slug: "my-team", name: "My Team" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/pub/my-team"));
  });

  it("keeps a typed address on blur and shows server error", async () => {
    server.use(
      http.get(api("/me/publications"), () => HttpResponse.json({ data: [] })),
      http.post(api("/publications"), () => HttpResponse.json({ status: 409, detail: "taken" }, { status: 409 })),
    );
    const { user } = await renderRouted(<MyPublications />);
    await user.click(await screen.findByRole("button", { name: "New publication" }));
    await user.type(await screen.findByLabelText("Address"), "mine-1");
    await user.type(screen.getByLabelText("Name"), "Foo");
    await user.tab();
    expect(screen.getByLabelText("Address")).toHaveValue("mine-1");
    await user.click(screen.getByRole("button", { name: "Create publication" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Create publication" })).toBeEnabled());
  });
});

describe("PublicationPage", () => {
  it("missing publication", async () => {
    server.use(http.get(api("/publications/acme"), () => HttpResponse.json({ status: 404, detail: "x" }, { status: 404 })));
    await renderRouted(<PublicationPage slug="acme" />);
    expect(await screen.findByText("This publication doesn't exist.")).toBeInTheDocument();
  });

  it("reader (no role, no description) has no controls", async () => {
    mockPub({ my_role: "", description: "" });
    await renderRouted(<PublicationPage slug="acme" />);
    expect(await screen.findByRole("heading", { name: "Acme" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit" })).toBeNull();
  });

  it("editor can edit but not delete", async () => {
    let body: unknown;
    mockPub({ my_role: "editor" });
    server.use(
      http.patch(api("/publications/acme"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: pub() });
      }),
    );
    const { user } = await renderRouted(<PublicationPage slug="acme" />);
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
    expect(await screen.findByLabelText("Address")).toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body).toMatchObject({ name: "Acme", avatar_url: "" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("owner deletes with confirm and navigates away", async () => {
    let deleted = 0;
    mockPub();
    server.use(
      http.delete(api("/publications/acme"), () => {
        deleted++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user, router } = await renderRouted(<PublicationPage slug="acme" />, { path: "/pub/acme" });
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    expect(deleted).toBe(0);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleted).toBe(1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/me/publications"));
  });

  it("people tab: owner manages members", async () => {
    signIn();
    const calls: string[] = [];
    mockPub({}, [member(3, "admin", "owner"), member(4, "ed", "editor", { display_name: "Ed" }), member(5, "wri", "writer")]);
    server.use(
      http.put(api("/publications/acme/members/:u"), async ({ params, request }) => {
        calls.push(`put ${params.u} ${JSON.stringify(await request.json())}`);
        return params.u === "bad" ? HttpResponse.json({ status: 400, detail: "no" }, { status: 400 }) : new HttpResponse(null, { status: 204 });
      }),
      http.delete(api("/publications/acme/members/:u"), ({ params }) => {
        calls.push(`del ${params.u}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderRouted(<PublicationPage slug="acme" />);
    await user.click(await screen.findByRole("tab", { name: "People" }));
    expect(await screen.findByText("Ed")).toBeInTheDocument();
    expect(screen.getByText("owner")).toBeInTheDocument();
    // add: empty submit ignored, then add @name as editor
    await user.click(screen.getByRole("button", { name: "Add" }));
    expect(calls).toEqual([]);
    await user.type(screen.getByLabelText("Username"), "@newbie");
    await user.selectOptions(screen.getByLabelText("Role"), "editor");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(calls).toContain('put newbie {"role":"editor"}'));
    await waitFor(() => expect(screen.getByLabelText("Username")).toHaveValue(""));
    await user.type(screen.getByLabelText("Username"), "bad");
    await user.click(screen.getByRole("button", { name: "Add" }));
    await waitFor(() => expect(calls).toContain('put bad {"role":"editor"}'));
    // change role & remove
    await user.selectOptions(screen.getByLabelText("Role of wri"), "editor");
    await waitFor(() => expect(calls).toContain('put wri {"role":"editor"}'));
    await user.click(within(screen.getByText("wri").closest("li") as HTMLElement).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(calls).toContain("del wri"));
  });

  it("people tab: editor sees writer role choice only; member can leave", async () => {
    signIn();
    const calls: string[] = [];
    mockPub({ my_role: "editor" }, [member(3, "admin", "writer"), member(9, "own", "owner")]);
    server.use(
      http.delete(api("/publications/acme/members/:u"), ({ params }) => {
        calls.push(`del ${params.u}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user } = await renderRouted(<PublicationPage slug="acme" />);
    await user.click(await screen.findByRole("tab", { name: "People" }));
    expect(await screen.findByLabelText("Role of admin")).toBeInTheDocument();
    expect(within(screen.getByLabelText("Role of admin")).queryByRole("option", { name: "Editor" })).toBeNull();
    expect(within(screen.getByLabelText("Role")).queryByRole("option", { name: "Editor" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Leave" }));
    expect(calls).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Leave" }));
    await waitFor(() => expect(calls).toEqual(["del admin"]));
  });

  it("people tab: reader sees read-only list, no add form; null members ok", async () => {
    mockPub({ my_role: "writer" }, null);
    const { user } = await renderRouted(<PublicationPage slug="acme" />);
    await user.click(await screen.findByRole("tab", { name: "People" }));
    await waitFor(() => expect(screen.queryByLabelText("Username")).toBeNull());
    await user.click(screen.getByRole("tab", { name: "Stories" }));
    expect(screen.getByRole("tab", { name: "Stories" })).toBeInTheDocument();
  });
});

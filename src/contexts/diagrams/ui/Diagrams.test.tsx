import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { tokens } from "@/shared/api";
import { me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { Dashboard } from "./Dashboard";
import { ProjectTree } from "./ProjectTree";
import { WriteMenu } from "./WriteMenu";

const project = (o: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Payments",
  role: "owner",
  treeRev: 1,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  updatedBy: String(me.id),
  fileCount: 2,
  folderCount: 0,
  thumbnailUrl: null,
  ownerId: String(me.id),
  ...o,
});
const fileMeta = (o: Record<string, unknown> = {}) => ({
  id: "f1",
  projectId: "p1",
  folderId: null,
  name: "Checkout",
  kind: "sdd",
  position: 0,
  version: 1,
  pageCount: 1,
  thumbnailUrl: null,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  ...o,
});

describe("Dashboard", () => {
  it("lists my projects and links each to its tree", async () => {
    signIn();
    server.use(
      http.get(api("/diagrams/projects"), () =>
        HttpResponse.json({ items: [project(), project({ id: "p2", name: "Search", role: "viewer" })], total: 2, page: 1, pageSize: 100 }),
      ),
    );
    await renderRouted(<Dashboard />, { path: "/d" });
    const link = await screen.findByRole("link", { name: /Payments/ });
    expect(link).toHaveAttribute("href", "/d/p/p1");
    // viewers cannot rename or delete
    expect(screen.getByRole("button", { name: "Rename Payments" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Rename Search" })).not.toBeInTheDocument();
    tokens.set(null);
  });

  it("shows the empty state with the three starting points", async () => {
    signIn();
    server.use(http.get(api("/diagrams/projects"), () => HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 100 })));
    await renderRouted(<Dashboard />, { path: "/d" });
    expect(await screen.findByText("No diagrams yet.")).toBeInTheDocument();
    for (const n of ["System design", "DB diagram", "OOD diagram"]) expect(screen.getAllByRole("button", { name: n }).length).toBeGreaterThan(0);
    tokens.set(null);
  });

  it("creates a project + file, tags the kind and opens the editor", async () => {
    signIn();
    server.use(http.get(api("/diagrams/projects"), () => HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 100 })));
    let created: unknown;
    let patched: unknown;
    server.use(
      http.post(api("/diagrams/projects"), async ({ request }) => {
        created = await request.json();
        return HttpResponse.json({ project: project({ id: "np" }), file: fileMeta({ id: "nf", projectId: "np" }) }, { status: 201 });
      }),
      http.patch(api("/diagrams/files/nf"), async ({ request }) => {
        patched = await request.json();
        return HttpResponse.json({ file: fileMeta({ id: "nf", kind: "erd" }) });
      }),
    );
    const { user, router } = await renderRouted(<Dashboard />, { path: "/d" });
    await screen.findByText("No diagrams yet.");
    const [dbButton] = screen.getAllByRole("button", { name: "DB diagram" });
    if (!dbButton) throw new Error("no button");
    await user.click(dbButton);
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/f/nf"));
    // a DB diagram starts with one table, built by the editor's own template pipeline
    const c = created as { name: string; file: { name: string; data: { version: number; pages: { nodes: { type: string; data: { label: string } }[] }[] } } };
    expect(c.name).toBe("DB diagram");
    expect(c.file.name).toBe("DB diagram");
    expect(c.file.data.version).toBe(2);
    expect(c.file.data.pages[0]?.nodes).toHaveLength(1);
    expect(c.file.data.pages[0]?.nodes[0]).toMatchObject({ type: "table", data: { label: "users" } });
    expect(patched).toEqual({ kind: "erd" });
    tokens.set(null);
  });
});

describe("Dashboard import", () => {
  const empty = () => http.get(api("/diagrams/projects"), () => HttpResponse.json({ items: [], total: 0, page: 1, pageSize: 100 }));

  it("uploads a .sdd and opens the imported file, warnings as a toast", async () => {
    signIn();
    let field: unknown;
    server.use(
      empty(),
      http.post(api("/diagrams/import"), async ({ request }) => {
        field = request.headers.get("content-type");
        return HttpResponse.json(
          { kind: "file", project: project({ id: "ip" }), file: fileMeta({ id: "if", projectId: "ip" }), warnings: ["unknown icon"] },
          { status: 201 },
        );
      }),
    );
    const { user, router } = await renderRouted(<Dashboard />, { path: "/d" });
    await screen.findByText("No diagrams yet.");
    await user.upload(screen.getByTestId("import-sdd-input"), new File(["zip"], "a.sdd", { type: "application/vnd.sdd+zip" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/f/if"));
    expect(field).toMatch(/^multipart\/form-data; boundary=/);
    tokens.set(null);
  });

  it("opens an imported project container", async () => {
    signIn();
    server.use(
      empty(),
      http.post(api("/diagrams/import"), () =>
        HttpResponse.json({ kind: "project", project: project({ id: "ip" }), folders: [], files: [], warnings: [] }, { status: 201 }),
      ),
    );
    const { user, router } = await renderRouted(<Dashboard />, { path: "/d" });
    await screen.findByText("No diagrams yet.");
    await user.upload(screen.getByTestId("import-sdd-input"), new File(["zip"], "p.sdd"));
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/p/ip"));
    tokens.set(null);
  });

  it("stays put and shows the reason on 422 SDD_INVALID", async () => {
    signIn();
    server.use(
      empty(),
      http.post(api("/diagrams/import"), () =>
        HttpResponse.json({ error: { code: "SDD_INVALID", message: "bad", details: { reason: "manifest missing" } } }, { status: 422 }),
      ),
    );
    const { user, router } = await renderRouted(<Dashboard />, { path: "/d" });
    await screen.findByText("No diagrams yet.");
    await user.upload(screen.getByTestId("import-sdd-input"), new File(["x"], "bad.sdd"));
    expect(await screen.findByText(/manifest missing/)).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/d");
    tokens.set(null);
  });
});

describe("WriteMenu", () => {
  it("offers the diagram starting points next to the story entry", async () => {
    signIn();
    server.use(
      http.post(api("/diagrams/projects"), () =>
        HttpResponse.json({ project: project({ id: "np" }), file: fileMeta({ id: "nf", projectId: "np" }) }, { status: 201 }),
      ),
    );
    const { user, router } = await renderRouted(<WriteMenu />);
    await user.click(screen.getByRole("button", { name: "More ways to write" }));
    const menu = await screen.findByRole("menu");
    expect(within(menu).getByRole("menuitem", { name: "New story" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "DB diagram" })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: "OOD diagram" })).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "System design diagram" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/f/nf"));
    tokens.set(null);
  });
});

describe("ProjectTree", () => {
  it("shows folders then files and links files to the editor", async () => {
    signIn();
    server.use(
      http.get(api("/diagrams/projects/p1/tree"), () =>
        HttpResponse.json({
          project: project(),
          treeRev: 1,
          folders: [{ id: "d1", projectId: "p1", parentId: null, name: "Core", position: 0, createdAt: 0, updatedAt: 0 }],
          files: [fileMeta({ id: "f9", name: "Inside", folderId: "d1" }), fileMeta({ id: "f1", name: "Checkout", kind: "erd" })],
        }),
      ),
    );
    await renderRouted(<ProjectTree projectId="p1" />, { path: "/d/p/p1" });
    expect(await screen.findByRole("link", { name: "Checkout" })).toHaveAttribute("href", "/d/f/f1");
    expect(screen.getByRole("link", { name: "Inside" })).toHaveAttribute("href", "/d/f/f9");
    expect(screen.getByText("Core")).toBeInTheDocument();
    tokens.set(null);
  });

  const treeWith = (extra: Record<string, unknown> = {}) =>
    http.get(api("/diagrams/projects/p1/tree"), () =>
      HttpResponse.json({
        project: project(extra),
        treeRev: 1,
        folders: [{ id: "d1", projectId: "p1", parentId: null, name: "Core", position: 0 }],
        files: [fileMeta({ id: "f1", name: "Checkout" }), fileMeta({ id: "f2", name: "Search" })],
      }),
    );

  it("creates a folder", async () => {
    signIn();
    let body: unknown;
    server.use(
      treeWith(),
      http.post(api("/diagrams/projects/p1/folders"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ folder: { id: "d2", projectId: "p1", parentId: null, name: "Docs", position: 1 } }, { status: 201 });
      }),
    );
    const { user } = await renderRouted(<ProjectTree projectId="p1" />, { path: "/d/p/p1" });
    await user.click(await screen.findByRole("button", { name: "New folder" }));
    await user.type(await screen.findByRole("textbox", { name: "Name" }), "Docs");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body).toEqual({ name: "Docs", parentId: null }));
    tokens.set(null);
  });

  it("moves a file through the Move to menu and filters by name", async () => {
    signIn();
    let body: unknown;
    server.use(
      treeWith(),
      http.patch(api("/diagrams/files/f1"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ file: fileMeta({ id: "f1", folderId: "d1" }) });
      }),
    );
    const { user } = await renderRouted(<ProjectTree projectId="p1" />, { path: "/d/p/p1" });
    await user.click(await screen.findByRole("button", { name: "Move Checkout to…" }));
    await user.click(await screen.findByRole("button", { name: "Core" }));
    await waitFor(() => expect(body).toEqual({ folderId: "d1" }));
    await user.type(screen.getByRole("searchbox", { name: "Search files" }), "sea");
    expect(screen.queryByRole("link", { name: "Checkout" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Search" })).toBeInTheDocument();
    tokens.set(null);
  });

  it("invites a member from the share panel", async () => {
    signIn();
    let body: unknown;
    server.use(
      treeWith(),
      http.get(api("/diagrams/projects/p1/members"), () =>
        HttpResponse.json({ items: [{ userId: String(me.id), email: me.email, name: "Admin", role: "owner", createdAt: 0, isOriginalOwner: true }] }),
      ),
      http.get(api("/diagrams/projects/p1/shares"), () => HttpResponse.json({ items: [] })),
      http.post(api("/diagrams/projects/p1/members"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ member: { userId: "9", email: "bob@x.dev", name: "Bob", role: "editor" } }, { status: 201 });
      }),
    );
    const { user } = await renderRouted(<ProjectTree projectId="p1" />, { path: "/d/p/p1" });
    await user.click(await screen.findByRole("button", { name: "Share" }));
    await screen.findByText("Admin");
    await user.type(screen.getByRole("textbox", { name: "Email or username" }), "bob@x.dev");
    await user.selectOptions(screen.getAllByRole("combobox", { name: "Role" })[0] as HTMLElement, "editor");
    await user.click(screen.getByRole("button", { name: "Invite" }));
    await waitFor(() => expect(body).toEqual({ email: "bob@x.dev", role: "editor" }));
    tokens.set(null);
  });

  it("lets a non-owner see people read-only and leave", async () => {
    signIn();
    let left = false;
    server.use(
      treeWith({ role: "viewer" }),
      http.get(api("/diagrams/projects/p1/members"), () =>
        HttpResponse.json({ items: [{ userId: String(me.id), email: me.email, name: "Admin", role: "viewer", createdAt: 0 }] }),
      ),
      http.delete(api(`/diagrams/projects/p1/members/${me.id}`), () => {
        left = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderRouted(<ProjectTree projectId="p1" />, { path: "/d/p/p1" });
    await user.click(await screen.findByRole("button", { name: "Share" }));
    await screen.findByText("Admin");
    expect(screen.queryByRole("textbox", { name: "Email or username" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Leave project" }));
    const dialogs = await screen.findAllByRole("alertdialog").catch(() => []);
    const confirm = (dialogs.length ? within(dialogs[0] as HTMLElement) : screen).getAllByRole("button", { name: "Leave project" }).at(-1) as HTMLElement;
    await user.click(confirm);
    await waitFor(() => expect(left).toBe(true));
    tokens.set(null);
  });

  it("says so when the project is gone", async () => {
    signIn();
    server.use(http.get(api("/diagrams/projects/zzz/tree"), () => HttpResponse.json({ error: { code: "NOT_FOUND", message: "no" } }, { status: 404 })));
    await renderRouted(<ProjectTree projectId="zzz" />, { path: "/d/p/zzz" });
    expect(await screen.findByText("Project not found.")).toBeInTheDocument();
    tokens.set(null);
  });
});

import { createEvent, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { ProjectTree } from "./ProjectTree";

const project = (o: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Payments",
  role: "owner",
  treeRev: 1,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  updatedBy: String(me.id),
  fileCount: 2,
  folderCount: 1,
  thumbnailUrl: null,
  ownerId: String(me.id),
  ...o,
});
const file = (o: Record<string, unknown> = {}) => ({
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
const folder = (o: Record<string, unknown> = {}) => ({
  id: "d1",
  projectId: "p1",
  parentId: null,
  name: "Core",
  position: 0,
  createdAt: 0,
  updatedAt: 0,
  ...o,
});
const err500 = () => HttpResponse.json({ error: { code: "X", message: "boom" } }, { status: 500 });
const ok204 = () => new HttpResponse(null, { status: 204 });
const hasToast = () => waitFor(() => expect(document.querySelector("[data-sonner-toast]")).not.toBeNull());

const tree = (o: { role?: string; files?: unknown[]; folders?: unknown[] } = {}) =>
  server.use(
    http.get(api("/diagrams/projects/p1/tree"), () =>
      HttpResponse.json({
        project: project({ role: o.role ?? "owner" }),
        treeRev: 1,
        folders: o.folders ?? [folder(), folder({ id: "d2", parentId: "d1", name: "Nested" })],
        files: o.files ?? [file(), file({ id: "f2", name: "Inner", folderId: "d1" }), file({ id: "f3", name: "Deep", folderId: "d2" })],
      }),
    ),
  );

const render = () => renderRouted(<ProjectTree projectId="p1" />, { path: "/d/p/p1" });
const dialog = async () => within(await screen.findByRole("dialog"));

beforeEach(() => signIn());
afterEach(() => {
  tokens.set(null);
  vi.restoreAllMocks();
});

describe("ProjectTree states", () => {
  it("shows a retry for a non-404 load failure and refetches", async () => {
    let n = 0;
    server.use(
      http.get(api("/diagrams/projects/p1/tree"), () => (n++ === 0 ? err500() : HttpResponse.json({ project: project(), treeRev: 1, folders: [], files: [] }))),
    );
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("This project has no files yet.")).toBeInTheDocument();
  });

  it("shows the empty state for no files and a no-match message when searching", async () => {
    tree({ files: [], folders: [] });
    const { user } = await render();
    expect(await screen.findByText("This project has no files yet.")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "zzz");
    expect(screen.getByText("No file matches.")).toBeInTheDocument();
  });

  it("a single file reads as '1 file'", async () => {
    tree({ files: [file()], folders: [] });
    await render();
    expect(await screen.findByText("1 file")).toBeInTheDocument();
  });

  it("viewers get no edit controls, but can download, see history and share", async () => {
    tree({ role: "viewer" });
    await render();
    await screen.findByRole("link", { name: "Checkout" });
    expect(screen.queryByRole("button", { name: "New folder" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename project" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Delete project" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename Checkout" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Rename folder Core" })).toBeNull();
    expect(screen.getByRole("button", { name: "Download Checkout as .sdd" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Version history of Checkout" })).toBeInTheDocument();
  });

  it("collapses and expands folders", async () => {
    tree();
    const { user } = await render();
    expect(await screen.findByRole("link", { name: "Deep" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Toggle folder Core" }));
    expect(screen.queryByRole("link", { name: "Deep" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Inner" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Toggle folder Core" }));
    expect(screen.getByRole("link", { name: "Inner" })).toBeInTheDocument();
  });
});

describe("ProjectTree project actions", () => {
  it("creates a file of each kind and opens it", async () => {
    tree();
    server.use(http.post(api("/diagrams/projects/p1/files"), () => HttpResponse.json({ file: file({ id: "nf" }) }, { status: 201 })));
    const { user, router } = await render();
    await user.click(await screen.findByRole("button", { name: "DB diagram" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/f/nf"));
  });

  it("a failed create toasts", async () => {
    tree();
    server.use(http.post(api("/diagrams/projects/p1/files"), err500));
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "OOD diagram" }));
    await hasToast();
  });

  it("renames the project; errors toast", async () => {
    tree();
    let body: unknown;
    let fail = true;
    server.use(
      http.patch(api("/diagrams/projects/p1"), async ({ request }) => {
        body = await request.json();
        return fail ? err500() : ok204();
      }),
    );
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Rename project" }));
    const d = await dialog();
    await user.clear(d.getByLabelText("Name"));
    await user.type(d.getByLabelText("Name"), "Billing");
    await user.click(d.getByRole("button", { name: "Save" }));
    await hasToast();
    fail = false;
    await user.click(d.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(body).toEqual({ name: "Billing" });
  });

  it("downloads the project and a file (success and failure)", async () => {
    tree({ files: [file()], folders: [] });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:x";
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    server.use(
      http.get(api("/diagrams/projects/p1/export"), () => new HttpResponse(new Blob(["x"]), { headers: { "content-type": "application/octet-stream" } })),
      http.get(api("/diagrams/files/f1/export"), err500),
    );
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Download .sdd" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Download Checkout as .sdd" }));
    await hasToast();
  });

  it("deletes the project after confirming and returns to the list", async () => {
    tree();
    let hit = 0;
    server.use(http.delete(api("/diagrams/projects/p1"), () => (hit++, ok204())));
    const { user, router } = await render();
    await user.click(await screen.findByRole("button", { name: "Delete project" }));
    await user.click((await dialog()).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(hit).toBe(1));
    await waitFor(() => expect(router.state.location.pathname).toBe("/d"));
  });

  it("a failed project delete toasts", async () => {
    tree();
    server.use(http.delete(api("/diagrams/projects/p1"), err500));
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Delete project" }));
    await user.click((await dialog()).getByRole("button", { name: "Delete" }));
    await hasToast();
  });

  it("cancel closes the delete dialog", async () => {
    tree();
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Delete project" }));
    await user.click((await dialog()).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("ProjectTree folders", () => {
  it("creates a nested folder", async () => {
    tree();
    let body: unknown;
    server.use(
      http.post(api("/diagrams/projects/p1/folders"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ folder: folder({ id: "d3" }) }, { status: 201 });
      }),
    );
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "New folder in Core" }));
    await user.type((await dialog()).getByLabelText("Name"), "Sub");
    await user.click((await dialog()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(body).toEqual({ name: "Sub", parentId: "d1" }));
  });

  it("a failed folder create toasts", async () => {
    tree();
    server.use(http.post(api("/diagrams/projects/p1/folders"), err500));
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "New folder" }));
    await user.type((await dialog()).getByLabelText("Name"), "Sub");
    await user.click((await dialog()).getByRole("button", { name: "Save" }));
    await hasToast();
  });

  it("renames a folder (ok and error)", async () => {
    tree();
    let fail = true;
    let body: unknown;
    server.use(
      http.patch(api("/diagrams/folders/d1"), async ({ request }) => {
        body = await request.json();
        return fail ? err500() : ok204();
      }),
    );
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Rename folder Core" }));
    await user.type((await dialog()).getByLabelText("Name"), "X");
    await user.click((await dialog()).getByRole("button", { name: "Save" }));
    await hasToast();
    fail = false;
    await user.click((await dialog()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(body).toEqual({ name: "CoreX" });
  });

  it("deletes a folder (ok and error)", async () => {
    tree();
    let fail = true;
    let hit = 0;
    server.use(http.delete(api("/diagrams/folders/d1"), () => (hit++, fail ? err500() : ok204())));
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Delete folder Core" }));
    await user.click((await dialog()).getByRole("button", { name: "Delete" }));
    await hasToast();
    fail = false;
    await user.click((await dialog()).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(hit).toBe(2));
  });
});

describe("ProjectTree files", () => {
  it("renames a file (ok and error)", async () => {
    tree();
    let fail = true;
    let body: unknown;
    server.use(
      http.patch(api("/diagrams/files/f1"), async ({ request }) => {
        body = await request.json();
        return fail ? err500() : ok204();
      }),
    );
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Rename Checkout" }));
    await user.type((await dialog()).getByLabelText("Name"), "2");
    await user.click((await dialog()).getByRole("button", { name: "Save" }));
    await hasToast();
    fail = false;
    await user.click((await dialog()).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(body).toEqual({ name: "Checkout2" });
  });

  it("deletes a file (ok and error)", async () => {
    tree();
    let fail = true;
    let hit = 0;
    server.use(http.delete(api("/diagrams/files/f1"), () => (hit++, fail ? err500() : ok204())));
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Delete Checkout" }));
    await user.click((await dialog()).getByRole("button", { name: "Delete" }));
    await hasToast();
    fail = false;
    await user.click((await dialog()).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(hit).toBe(2);
  });

  it("duplicates a file; a failure toasts", async () => {
    tree();
    let fail = false;
    let hit = 0;
    server.use(http.post(api("/diagrams/files/f1/duplicate"), () => (hit++, fail ? err500() : ok204())));
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Duplicate Checkout" }));
    await waitFor(() => expect(hit).toBe(1));
    fail = true;
    await user.click(screen.getByRole("button", { name: "Duplicate Checkout" }));
    await hasToast();
  });

  it("opens version history", async () => {
    tree();
    server.use(
      http.get(api("/diagrams/files/f1/versions"), () => HttpResponse.json({ items: [] })),
      http.get(api("/diagrams/files/f1"), () => HttpResponse.json({ file: { role: "owner" } })),
    );
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Version history of Checkout" }));
    expect(await screen.findByText("No versions yet.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByText("No versions yet.")).toBeNull());
  });

  it("the Move dialog moves to a nested folder, to root, and disables the current location", async () => {
    tree();
    const bodies: unknown[] = [];
    server.use(
      http.patch(api("/diagrams/files/:id"), async ({ request }) => {
        bodies.push(await request.json());
        return ok204();
      }),
    );
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Move Inner to…" }));
    const d = await dialog();
    expect(d.getByRole("button", { name: "Core" })).toBeDisabled();
    await user.click(d.getByRole("button", { name: "Nested" }));
    await waitFor(() => expect(bodies).toEqual([{ folderId: "d2" }]));
    await user.click(screen.getByRole("button", { name: "Move Inner to…" }));
    await user.click((await dialog()).getByRole("button", { name: "Project root" }));
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ folderId: null });
  });

  it("a failed move toasts", async () => {
    tree();
    server.use(http.patch(api("/diagrams/files/f1"), err500));
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Move Checkout to…" }));
    await user.click((await dialog()).getByRole("button", { name: "Core" }));
    await hasToast();
  });
});

describe("ProjectTree drag and drop", () => {
  const dt = () => ({ setData: vi.fn(), effectAllowed: "" });
  const drag = (el: Element, type: "dragStart" | "dragOver" | "drop" | "dragEnd" | "dragLeave", dataTransfer = dt()) => {
    const ev = createEvent[type](el, { dataTransfer });
    fireEvent(el, ev);
  };

  it("drops a file on a folder and on the root; ignores drops when nothing is dragged", async () => {
    tree();
    const bodies: unknown[] = [];
    server.use(
      http.patch(api("/diagrams/files/:id"), async ({ request }) => {
        bodies.push(await request.json());
        return ok204();
      }),
    );
    await render();
    await screen.findByRole("link", { name: "Checkout" });
    const li = (name: string) => screen.getByRole("link", { name }).closest("li") as HTMLElement;
    const folderLi = screen.getByRole("button", { name: "Toggle folder Core" }).closest("li") as HTMLElement;

    drag(folderLi, "dragOver");
    drag(folderLi, "drop");
    expect(bodies).toHaveLength(0);

    drag(li("Checkout"), "dragStart");
    drag(folderLi, "dragOver");
    drag(folderLi, "dragOver"); // same key twice: no state change
    drag(folderLi, "drop");
    await waitFor(() => expect(bodies).toEqual([{ folderId: "d1" }]));

    drag(li("Inner"), "dragStart");
    const root = screen.getByText("3 files").closest(".tile") as HTMLElement;
    drag(root, "dragOver");
    drag(root, "dragLeave");
    drag(root, "drop");
    await waitFor(() => expect(bodies).toHaveLength(2));
    expect(bodies[1]).toEqual({ folderId: null });

    drag(li("Checkout"), "dragStart");
    drag(li("Checkout"), "dragEnd");
    drag(folderLi, "drop");
    expect(bodies).toHaveLength(2);
  });

  it("dropping a file where it already is does nothing", async () => {
    tree();
    let hit = 0;
    server.use(http.patch(api("/diagrams/files/:id"), () => (hit++, ok204())));
    await render();
    await screen.findByRole("link", { name: "Checkout" });
    const li = screen.getByRole("link", { name: "Checkout" }).closest("li") as HTMLElement;
    const root = screen.getByText("3 files").closest(".tile") as HTMLElement;
    drag(li, "dragStart");
    drag(root, "drop");
    expect(hit).toBe(0);
  });
});

describe("ProjectTree phone menu", () => {
  it("runs every action from the row menu", async () => {
    tree({ files: [file()], folders: [] });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => "blob:x";
    (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = () => {};
    let dup = 0;
    server.use(
      http.get(api("/diagrams/files/f1/export"), () => new HttpResponse(new Blob(["x"]))),
      http.post(api("/diagrams/files/f1/duplicate"), () => (dup++, ok204())),
      http.get(api("/diagrams/files/f1/versions"), () => HttpResponse.json({ items: [] })),
      http.get(api("/diagrams/files/f1"), () => HttpResponse.json({ file: { role: "owner" } })),
    );
    const { user } = await render();
    const open = async () => user.click(await screen.findByRole("button", { name: "Actions for Checkout" }));
    await open();
    await user.click(await screen.findByRole("menuitem", { name: "Download .sdd" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    await open();
    await user.click(await screen.findByRole("menuitem", { name: "Duplicate" }));
    await waitFor(() => expect(dup).toBe(1));
    await open();
    await user.click(await screen.findByRole("menuitem", { name: "Version history" }));
    expect(await screen.findByText("No versions yet.")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await open();
    await user.click(await screen.findByRole("menuitem", { name: "Move to…" }));
    expect(await screen.findByRole("button", { name: "Project root" })).toBeDisabled();
    await user.keyboard("{Escape}");
    await open();
    await user.click(await screen.findByRole("menuitem", { name: "Rename" }));
    expect((await screen.findAllByText("Rename file")).length).toBeGreaterThan(0);
    await user.keyboard("{Escape}");
    await open();
    await user.click(await screen.findByRole("menuitem", { name: "Delete" }));
    expect((await screen.findAllByText("Delete file")).length).toBeGreaterThan(0);
  });

  it("the viewer's menu has only read actions", async () => {
    tree({ role: "viewer", files: [file()], folders: [] });
    const { user } = await render();
    await user.click(await screen.findByRole("button", { name: "Actions for Checkout" }));
    expect(await screen.findByRole("menuitem", { name: "Download .sdd" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "Delete" })).toBeNull();
  });
});

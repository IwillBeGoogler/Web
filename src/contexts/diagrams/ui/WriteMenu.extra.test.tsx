import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { tokens } from "@/shared/api";
import { signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { WriteMenu } from "./WriteMenu";

afterEach(() => {
  tokens.set(null);
  authDialog.close();
});

const file = {
  id: "nf",
  projectId: "np",
  folderId: null,
  name: "n",
  kind: "sdd",
  position: 0,
  version: 1,
  pageCount: 1,
  thumbnailUrl: null,
  createdAt: 0,
  updatedAt: 0,
};
const proj = {
  id: "np",
  name: "n",
  role: "owner",
  treeRev: 1,
  createdAt: 0,
  updatedAt: 0,
  updatedBy: "3",
  fileCount: 1,
  folderCount: 0,
  thumbnailUrl: null,
  ownerId: "3",
};
const open = async () => {
  const r = await renderRouted(<WriteMenu />);
  await r.user.click(screen.getByRole("button", { name: "More ways to write" }));
  return { ...r, menu: within(await screen.findByRole("menu")) };
};

describe("WriteMenu", () => {
  it("New story and Templates navigate", async () => {
    signIn();
    const a = await open();
    await a.user.click(a.menu.getByRole("menuitem", { name: "New story" }));
    await waitFor(() => expect(a.router.state.location.pathname).toBe("/new-story"));
    a.unmount();
    const b = await open();
    await b.user.click(b.menu.getByRole("menuitem", { name: "Templates" }));
    await waitFor(() => expect(b.router.state.location.pathname).toBe("/templates"));
  });

  it("an expired session opens the sign-in dialog", async () => {
    signIn();
    server.use(http.post(api("/diagrams/projects"), () => HttpResponse.json({ error: { code: "UNAUTHORIZED", message: "no" } }, { status: 401 })));
    const { user, menu } = await open();
    await user.click(menu.getByRole("menuitem", { name: "DB diagram" }));
    await waitFor(() => expect(authDialog.get()).toBe("signin"));
  });

  it("another failure toasts and keeps the dialog closed", async () => {
    signIn();
    server.use(http.post(api("/diagrams/projects"), () => HttpResponse.json({ error: { code: "X", message: "boom" } }, { status: 500 })));
    const { user, menu } = await open();
    await user.click(menu.getByRole("menuitem", { name: "OOD diagram" }));
    await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).not.toBeNull());
    expect(authDialog.get()).toBeNull();
  });

  it("creating an ERD sets the kind when the server made a different one", async () => {
    signIn();
    let kind: unknown;
    server.use(
      http.post(api("/diagrams/projects"), () => HttpResponse.json({ project: proj, file }, { status: 201 })),
      http.patch(api("/diagrams/files/nf"), async ({ request }) => {
        kind = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user, menu, router } = await open();
    await user.click(menu.getByRole("menuitem", { name: "DB diagram" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/f/nf"));
    expect(kind).toEqual({ kind: "erd" });
  });
});

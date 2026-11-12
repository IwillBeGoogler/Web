import { screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { tokens } from "@/shared/api";
import { me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { CategoriesMenu, DiagramsMenu } from "./NavMenus";

afterEach(() => {
  tokens.set(null);
  authDialog.close();
});

const created = {
  project: {
    id: "np",
    name: "Untitled",
    role: "owner",
    treeRev: 1,
    createdAt: 0,
    updatedAt: 0,
    updatedBy: String(me.id),
    fileCount: 1,
    folderCount: 0,
    thumbnailUrl: null,
    ownerId: String(me.id),
  },
  file: {
    id: "nf",
    projectId: "np",
    folderId: null,
    name: "Untitled",
    kind: "sdd",
    position: 0,
    version: 1,
    pageCount: 1,
    thumbnailUrl: null,
    createdAt: 0,
    updatedAt: 0,
  },
};

async function openMenu(user: { click: (el: Element) => Promise<void> }, name: string) {
  await user.click(screen.getByRole("button", { name }));
  return screen.findByRole("menu");
}

describe("DiagramsMenu", () => {
  it("asks signed-out readers to sign in before opening or creating diagrams; templates stay open", async () => {
    server.use(http.get(api("/me"), () => HttpResponse.json({ error: "unauthorized" }, { status: 401 })));
    const { user, router } = await renderRouted(<DiagramsMenu />);
    let menu = await openMenu(user, "Diagrams");
    await user.click(within(menu).getByRole("menuitem", { name: "My diagrams" }));
    expect(authDialog.get()).toBe("signin");
    authDialog.close();
    menu = await openMenu(user, "Diagrams");
    await user.click(within(menu).getByRole("menuitem", { name: "DB diagram" }));
    expect(authDialog.get()).toBe("signin");
    menu = await openMenu(user, "Diagrams");
    await user.click(within(menu).getByRole("menuitem", { name: "Templates" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/templates"));
  });

  it("opens my diagrams and creates a new one when signed in", async () => {
    signIn();
    server.use(http.post(api("/diagrams/projects"), () => HttpResponse.json(created, { status: 201 })));
    const { user, router } = await renderRouted(<DiagramsMenu />);
    await screen.findByRole("button", { name: "Diagrams" });
    await waitFor(() => expect(tokens.get()).not.toBeNull());
    let menu = await openMenu(user, "Diagrams");
    expect(within(menu).getByRole("menuitem", { name: "OOD diagram" })).toBeInTheDocument();
    await user.click(within(menu).getByRole("menuitem", { name: "My diagrams" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/d"));
    menu = await openMenu(user, "Diagrams");
    await user.click(within(menu).getByRole("menuitem", { name: "System design diagram" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/f/nf"));
  });
});

describe("CategoriesMenu", () => {
  it("lists root topics with story totals and links them, then all topics", async () => {
    server.use(
      http.get(api("/categories"), () =>
        HttpResponse.json({
          data: [
            { id: 1, parent_id: 0, slug: "system-design", name: "System Design", names: {}, position: 0, count: 2 },
            { id: 2, parent_id: 1, slug: "caching", name: "Caching", names: {}, position: 0, count: 10 },
            { id: 3, parent_id: 0, slug: "devops", name: "DevOps", names: {}, position: 1, count: 3 },
          ],
        }),
      ),
    );
    const { user, router } = await renderRouted(<CategoriesMenu />);
    const menu = await openMenu(user, "Categories");
    const first = await within(menu).findByRole("menuitem", { name: /System Design/ });
    expect(first).toHaveTextContent("12");
    expect(within(menu).getAllByRole("menuitem")[0]).toBe(first);
    expect(within(menu).queryByRole("menuitem", { name: "All topics" })).toBeNull();
    await user.click(within(menu).getByRole("menuitem", { name: /DevOps/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/topics/devops"));
  });

  it("shows a placeholder while loading and nothing when there are no topics", async () => {
    server.use(
      http.get(api("/categories"), async () => {
        await delay(50);
        return HttpResponse.json({ data: [] });
      }),
    );
    const { user } = await renderRouted(<CategoriesMenu />);
    const menu = await openMenu(user, "Categories");
    expect(within(menu).getByText("…")).toBeInTheDocument();
    await waitFor(() => expect(within(menu).queryByText("…")).toBeNull());
    expect(within(menu).queryAllByRole("menuitem")).toHaveLength(0);
  });
});

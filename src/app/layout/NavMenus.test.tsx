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
  it("lists the top tags with counts and links them, then all topics", async () => {
    server.use(
      http.get(api("/tags"), () =>
        HttpResponse.json({
          data: [
            { name: "go", count: 3 },
            { name: "system-design", count: 12 },
          ],
        }),
      ),
    );
    const { user, router } = await renderRouted(<CategoriesMenu />);
    let menu = await openMenu(user, "Categories");
    const first = await within(menu).findByRole("menuitem", { name: /system-design/ });
    expect(first).toHaveTextContent("12");
    expect(within(menu).getAllByRole("menuitem")[0]).toBe(first);
    await user.click(within(menu).getByRole("menuitem", { name: /go/ }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/tag/go"));
    menu = await openMenu(user, "Categories");
    await user.click(within(menu).getByRole("menuitem", { name: "All topics" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/search"));
  });

  it("shows a placeholder while loading and only all topics when there are no tags", async () => {
    server.use(
      http.get(api("/tags"), async () => {
        await delay(50);
        return HttpResponse.json({ data: [] });
      }),
    );
    const { user } = await renderRouted(<CategoriesMenu />);
    const menu = await openMenu(user, "Categories");
    expect(within(menu).getByText("…")).toBeInTheDocument();
    await waitFor(() => expect(within(menu).queryByText("…")).toBeNull());
    expect(
      within(menu)
        .getAllByRole("menuitem")
        .map((i) => i.textContent?.trim()),
    ).toEqual(["All topics"]);
    expect(menu.querySelector('[role="separator"]')).toBeNull();
  });
});

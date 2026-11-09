import { screen, waitFor } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { tokens } from "@/shared/api";
import { makePost, page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { ListCard, ListForm, ListPage, MyLists, SaveToList } from "./Lists";

const list = (o: Record<string, unknown> = {}) => ({
  id: 1,
  slug: "fav",
  name: "Favourites",
  description: "Nice ones",
  private: false,
  owner: "admin",
  user_id: 3,
  posts: 2,
  ...o,
});

afterEach(() => {
  tokens.set(null);
  authDialog.close();
  vi.restoreAllMocks();
});

describe("ListForm", () => {
  it("validates, creates and reports server error", async () => {
    let n = 0;
    server.use(
      http.post(api("/lists"), () => {
        n++;
        return n === 1 ? HttpResponse.json({ status: 500, detail: "boom" }, { status: 500 }) : HttpResponse.json({ data: list() });
      }),
    );
    const onDone = vi.fn();
    const { user } = await renderRouted(<ListForm onDone={onDone} />);
    await user.click(screen.getByRole("button", { name: "Create" }));
    expect(await screen.findByText("Give your list a name")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Name"), "Favourites");
    await user.click(screen.getByLabelText("Make it private"));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(n).toBe(1));
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("updates an existing list", async () => {
    let body: unknown;
    server.use(
      http.patch(api("/lists/fav"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ data: list({ name: "New" }) });
      }),
    );
    const onDone = vi.fn();
    const { user } = await renderRouted(<ListForm initial={list() as never} onDone={onDone} />);
    const name = screen.getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "New");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
    expect(body).toMatchObject({ name: "New", description: "Nice ones", private: false });
  });
});

describe("ListCard", () => {
  it("shows singular, private, no description", async () => {
    await renderRouted(
      <ul>
        <ListCard l={list({ posts: 1, private: true, description: "" }) as never} />
        <ListCard l={list({ id: 2, slug: "b", name: "B" }) as never} />
      </ul>,
    );
    expect(screen.getByText(/1 story/)).toBeInTheDocument();
    expect(screen.getByLabelText("Private")).toBeInTheDocument();
    expect(screen.getByText("Nice ones")).toBeInTheDocument();
    expect(screen.getByText(/2 stories/)).toBeInTheDocument();
  });
});

describe("MyLists", () => {
  it("lists, and creates a new list via modal", async () => {
    signIn();
    server.use(
      http.get(api("/me/lists"), () => page([list()])),
      http.post(api("/lists"), () => HttpResponse.json({ data: list({ id: 2, slug: "n", name: "N" }) })),
    );
    const { user } = await renderRouted(<MyLists />);
    expect(await screen.findByText("Favourites")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "New list" }));
    await user.type(await screen.findByLabelText("Name"), "N");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("empty state", async () => {
    signIn();
    server.use(http.get(api("/me/lists"), () => page([])));
    await renderRouted(<MyLists />);
    expect(await screen.findByText("No lists yet.")).toBeInTheDocument();
  });
});

describe("SaveToList", () => {
  it("asks to sign in when signed out", async () => {
    const { user } = await renderRouted(<SaveToList postId={5} />);
    await user.click(screen.getByRole("button", { name: "Add to list" }));
    expect(authDialog.get()).toBe("signin");
  });

  it("toggles membership, shows private, creates new list", async () => {
    signIn();
    const seen: string[] = [];
    server.use(
      http.get(api("/me/lists"), () => page([list({ contains: true, private: true }), list({ id: 2, slug: "b", name: "Other" })])),
      http.all(api("/lists/b/posts/5"), ({ request }) => {
        seen.push(request.method);
        return new HttpResponse(null, { status: 204 });
      }),
      http.all(api("/lists/fav/posts/5"), ({ request }) => {
        seen.push(`fav-${request.method}`);
        return request.method === "DELETE" ? HttpResponse.json({ status: 500, detail: "x" }, { status: 500 }) : new HttpResponse(null, { status: 204 });
      }),
      http.post(api("/lists"), () => HttpResponse.json({ data: list({ id: 9, slug: "new", name: "Brand" }) })),
      http.put(api("/lists/new/posts/5"), () => {
        seen.push("new-PUT");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderRouted(<SaveToList postId={5} />);
    await user.click(screen.getByRole("button", { name: "Add to list" }));
    expect(await screen.findByText("Other")).toBeInTheDocument();
    expect(screen.getByLabelText("Private")).toBeInTheDocument();
    await user.click(screen.getByRole("checkbox", { name: "Other" }));
    await user.click(screen.getByRole("checkbox", { name: /Favourites/ }));
    await waitFor(() => expect(seen).toEqual(expect.arrayContaining(["PUT", "fav-DELETE"])));
    await user.click(screen.getByRole("button", { name: /Create new list/ }));
    await user.type(await screen.findByLabelText("Name"), "Brand");
    await user.click(screen.getByRole("button", { name: "Create" }));
    await waitFor(() => expect(seen).toContain("new-PUT"));
    expect(await screen.findByText("Other")).toBeInTheDocument();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });
});

describe("ListPage", () => {
  const posts = () => http.get(api("/lists/fav/posts"), () => page([makePost({ id: 11, title: "In list", slug: "in-list" })]));

  it("owner can edit, remove story and delete", async () => {
    signIn();
    let removed = 0;
    let deleted = 0;
    server.use(
      http.get(api("/lists/fav"), () => HttpResponse.json({ data: list({ private: true }) })),
      posts(),
      http.delete(api("/lists/fav/posts/11"), () => {
        removed++;
        return new HttpResponse(null, { status: 204 });
      }),
      http.patch(api("/lists/fav"), () => HttpResponse.json({ data: list({ name: "Edited" }) })),
      http.delete(api("/lists/fav"), () => {
        deleted++;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValue(true);
    const { user } = await renderRouted(<ListPage slug="fav" />);
    expect(await screen.findByText("In list")).toBeInTheDocument();
    expect(await screen.findByText(/Private/)).toBeInTheDocument();
    await user.click(await screen.findByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removed).toBe(1));
    await user.click(screen.getByRole("button", { name: "Edit list" }));
    await user.click(await screen.findByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(deleted).toBe(0);
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(deleted).toBe(1));
    expect(confirmSpy).toHaveBeenCalledTimes(2);
  });

  it("visitor sees read-only list, no owner link or description", async () => {
    server.use(
      http.get(api("/lists/fav"), () => HttpResponse.json({ data: list({ owner: "", description: "" }) })),
      posts(),
    );
    await renderRouted(<ListPage slug="fav" />);
    expect(await screen.findByText("In list")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Edit list" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Remove" })).toBeNull();
  });

  it("shows owner link and empty message", async () => {
    server.use(
      http.get(api("/lists/fav"), () => HttpResponse.json({ data: list() })),
      http.get(api("/lists/fav/posts"), () => page([])),
    );
    await renderRouted(<ListPage slug="fav" />);
    expect(await screen.findByText("No stories in this list yet.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "admin" })).toBeInTheDocument();
  });

  it("shows skeleton while stories load", async () => {
    server.use(
      http.get(api("/lists/fav"), () => HttpResponse.json({ data: list() })),
      http.get(api("/lists/fav/posts"), async () => {
        await delay(300);
        return page([]);
      }),
    );
    await renderRouted(<ListPage slug="fav" />);
    await screen.findByRole("heading", { name: "Favourites" });
    expect(screen.queryByText("No stories in this list yet.")).toBeNull();
    expect(await screen.findByText("No stories in this list yet.")).toBeInTheDocument();
  });

  it("missing / private list", async () => {
    server.use(
      http.get(api("/lists/fav"), () => HttpResponse.json({ status: 404, detail: "nope" }, { status: 404 })),
      http.get(api("/lists/fav/posts"), () => HttpResponse.json({ status: 404, detail: "nope" }, { status: 404 })),
    );
    await renderRouted(<ListPage slug="fav" />);
    expect(await screen.findByText("This list doesn't exist or is private.")).toBeInTheDocument();
  });
});

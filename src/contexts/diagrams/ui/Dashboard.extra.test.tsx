import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { Dashboard } from "./Dashboard";

const project = (o: Record<string, unknown> = {}) => ({
  id: "p1",
  name: "Payments",
  role: "owner",
  treeRev: 1,
  createdAt: 1_700_000_000_000,
  updatedAt: 1_700_000_000_000,
  updatedBy: String(me.id),
  fileCount: 1,
  folderCount: 0,
  thumbnailUrl: null,
  ownerId: String(me.id),
  ...o,
});
const list = (items: unknown[]) => HttpResponse.json({ items, total: items.length, page: 1, pageSize: 100 });

describe("Dashboard extras", () => {
  it("shows an error with retry, then the list", async () => {
    signIn();
    let fail = true;
    server.use(http.get(api("/diagrams/projects"), () => (fail ? HttpResponse.json({}, { status: 500 }) : list([project()]))));
    const { user } = await renderRouted(<Dashboard />, { path: "/d" });
    const retry = await screen.findByRole("button", { name: "Try again" });
    fail = false;
    await user.click(retry);
    expect(await screen.findByText("1 file")).toBeInTheDocument();
    tokens.set(null);
  });

  it("searches, sorts, and shows the no-match state", async () => {
    signIn();
    const seen: string[] = [];
    server.use(
      http.get(api("/diagrams/projects"), ({ request }) => {
        const u = new URL(request.url);
        seen.push(`${u.searchParams.get("q") ?? ""}|${u.searchParams.get("sort") ?? ""}`);
        return list(u.searchParams.get("q") ? [] : [project()]);
      }),
    );
    const { user } = await renderRouted(<Dashboard />, { path: "/d" });
    await screen.findByText("Payments");
    await user.click(screen.getByRole("radio", { name: "Name" }));
    await user.type(screen.getByRole("textbox", { name: /search/i }), "zzz");
    expect(await screen.findByText("No project matches.")).toBeInTheDocument();
    expect(seen.some((s) => s.includes("zzz"))).toBe(true);
    tokens.set(null);
  });

  it("renames and deletes a project, and surfaces failures", async () => {
    signIn();
    server.use(
      http.get(api("/diagrams/projects"), () => list([project({ fileCount: 3 })])),
      http.patch(api("/diagrams/projects/p1"), () => HttpResponse.json({ project: project({ name: "New" }) })),
      http.delete(api("/diagrams/projects/p1"), () => new HttpResponse(null, { status: 204 })),
    );
    const { user } = await renderRouted(<Dashboard />, { path: "/d" });
    await user.click(await screen.findByRole("button", { name: "Rename Payments" }));
    const box = await screen.findByRole("textbox", { name: "Name" });
    await user.clear(box);
    await user.type(box, "New");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull());
    await user.click(screen.getByRole("button", { name: "Delete Payments" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    tokens.set(null);
  });

  it("failed rename and delete keep the dialog; cancel closes it", async () => {
    signIn();
    server.use(
      http.get(api("/diagrams/projects"), () => list([project()])),
      http.patch(api("/diagrams/projects/p1"), () => HttpResponse.json({}, { status: 500 })),
      http.delete(api("/diagrams/projects/p1"), () => HttpResponse.json({}, { status: 500 })),
    );
    const { user } = await renderRouted(<Dashboard />, { path: "/d" });
    await user.click(await screen.findByRole("button", { name: "Rename Payments" }));
    const box = await screen.findByRole("textbox", { name: "Name" });
    await user.type(box, "x");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Save" })).not.toBeDisabled());
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Delete Payments" }));
    await user.click(await screen.findByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    tokens.set(null);
  });

  it("downloads a project as .sdd and reports a failure", async () => {
    signIn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => "blob:x");
    URL.revokeObjectURL = vi.fn();
    server.use(
      http.get(api("/diagrams/projects"), () => list([project()])),
      http.get(api("/diagrams/projects/p1/export"), () => new HttpResponse("zip", { status: 200 })),
    );
    const { user } = await renderRouted(<Dashboard />, { path: "/d" });
    await user.click(await screen.findByRole("button", { name: "Download Payments as .sdd" }));
    await waitFor(() => expect(click).toHaveBeenCalled());
    server.use(http.get(api("/diagrams/projects/p1/export"), () => HttpResponse.json({}, { status: 500 })));
    await user.click(screen.getByRole("button", { name: "Download Payments as .sdd" }));
    click.mockRestore();
    tokens.set(null);
  });

  it("ignores an empty file pick", async () => {
    signIn();
    server.use(http.get(api("/diagrams/projects"), () => list([])));
    await renderRouted(<Dashboard />, { path: "/d" });
    const input = await screen.findByTestId("import-sdd-input");
    fireEvent.change(input, { target: { files: [] } });
    tokens.set(null);
  });

  it("opens the file picker from the Import button", async () => {
    signIn();
    server.use(http.get(api("/diagrams/projects"), () => list([])));
    const { user } = await renderRouted(<Dashboard />, { path: "/d" });
    const input = (await screen.findByTestId("import-sdd-input")) as HTMLInputElement;
    const click = vi.spyOn(input, "click").mockImplementation(() => {});
    await user.click(screen.getByRole("button", { name: /import/i }));
    expect(click).toHaveBeenCalled();
    tokens.set(null);
  });

  it("reports a generic import failure without the invalid-file prefix", async () => {
    signIn();
    server.use(
      http.get(api("/diagrams/projects"), () => list([])),
      http.post(api("/diagrams/import"), () => HttpResponse.json({}, { status: 500 })),
    );
    const { user } = await renderRouted(<Dashboard />, { path: "/d" });
    await user.upload(await screen.findByTestId("import-sdd-input"), new File(["x"], "a.sdd"));
    await waitFor(() => expect(screen.getByRole("button", { name: /import/i })).not.toBeDisabled());
    expect(screen.queryByText(/Invalid/i)).toBeNull();
    tokens.set(null);
  });
});

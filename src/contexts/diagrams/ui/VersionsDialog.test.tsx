import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { VersionsDialog } from "./VersionsDialog";

const ver = (version: number, o: Record<string, unknown> = {}) => ({ version, name: "", createdAt: 1_700_000_000_000, ...o });
const asRole = (role: string) => server.use(http.get(api("/diagrams/files/f1"), () => HttpResponse.json({ file: { role } })));
const list = (items: unknown) => server.use(http.get(api("/diagrams/files/f1/versions"), () => HttpResponse.json({ items })));
const doc = (nodes: unknown[], edges: unknown[] = []) => ({ nodes, edges });
const getVersion = (docs: Record<number, unknown>) =>
  server.use(
    http.get(api("/diagrams/files/f1/versions/:v"), ({ params }) => HttpResponse.json({ version: ver(Number(params.v), { data: docs[Number(params.v)] }) })),
  );

const open = (o = true) => renderRouted(<VersionsDialog fileId="f1" open={o} onOpenChange={() => {}} />);

describe("VersionsDialog", () => {
  it("does not fetch while closed", async () => {
    let hit = 0;
    server.use(http.get(api("/diagrams/files/f1/versions"), () => (hit++, HttpResponse.json({ items: [] }))));
    await open(false);
    expect(hit).toBe(0);
  });

  it("shows the empty state, and viewers get no save button", async () => {
    list(null);
    asRole("viewer");
    await open();
    expect(await screen.findByText("No versions yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save version…" })).toBeNull();
  });

  it("shows a load error", async () => {
    server.use(http.get(api("/diagrams/files/f1/versions"), () => HttpResponse.json({ error: { message: "x" } }, { status: 500 })));
    asRole("owner");
    await open();
    expect(await screen.findByText("Couldn't load versions.")).toBeInTheDocument();
  });

  it("lists versions with author fallbacks, named badge and label", async () => {
    list([ver(3, { createdByName: "Ali", label: "Latest" }), ver(2, { createdBy: "share:9", name: "Named", named: true }), ver(1, {})]);
    asRole("viewer");
    await open();
    expect(await screen.findByText("Latest")).toBeInTheDocument();
    expect(screen.getAllByText("Named")).toHaveLength(2);
    expect(screen.getAllByText(/Ali|share|Unknown/i).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Restore" })).toBeNull();
  });

  it("saves a named version, cancel closes the form, blank name is ignored", async () => {
    list([ver(1)]);
    asRole("editor");
    let sent: unknown;
    server.use(
      http.post(api("/diagrams/files/f1/versions"), async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ version: ver(2) });
      }),
    );
    const { user } = await open();
    await user.click(await screen.findByRole("button", { name: "Save version…" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await user.click(screen.getByRole("button", { name: "Save version…" }));
    await user.type(screen.getByPlaceholderText("Version name"), "   {Enter}");
    expect(sent).toBeUndefined();
    await user.type(screen.getByPlaceholderText("Version name"), "Milestone");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(sent).toEqual({ name: "Milestone" }));
    expect(await screen.findByRole("button", { name: "Save version…" })).toBeInTheDocument();
  });

  it("a failed save keeps the form", async () => {
    list([ver(1)]);
    asRole("owner");
    server.use(http.post(api("/diagrams/files/f1/versions"), () => HttpResponse.json({ error: { message: "no" } }, { status: 500 })));
    const { user } = await open();
    await user.click(await screen.findByRole("button", { name: "Save version…" }));
    await user.type(screen.getByPlaceholderText("Version name"), "X");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).not.toBeNull());
    expect(screen.getByPlaceholderText("Version name")).toHaveValue("X");
  });

  it("restores an older version after confirming; the newest has no restore button", async () => {
    list([ver(2), ver(1)]);
    asRole("owner");
    let restored = 0;
    server.use(http.post(api("/diagrams/files/f1/versions/1/restore"), () => (restored++, new HttpResponse(null, { status: 204 }))));
    const { user } = await open();
    const buttons = await screen.findAllByRole("button", { name: "Restore" });
    expect(buttons).toHaveLength(1);
    await user.click(buttons[0] as HTMLElement);
    expect(await screen.findByText("Restore version 1?")).toBeInTheDocument();
    await user.click(screen.getAllByRole("button", { name: "Restore" }).at(-1) as HTMLElement);
    await waitFor(() => expect(restored).toBe(1));
  });

  it("a failed restore reports an error", async () => {
    list([ver(2), ver(1)]);
    asRole("editor");
    server.use(http.post(api("/diagrams/files/f1/versions/1/restore"), () => HttpResponse.json({ error: { message: "no" } }, { status: 500 })));
    const { user } = await open();
    await user.click((await screen.findAllByRole("button", { name: "Restore" }))[0] as HTMLElement);
    await user.click(screen.getAllByRole("button", { name: "Restore" }).at(-1) as HTMLElement);
    await waitFor(() => expect(document.querySelector("[data-sonner-toast]")).not.toBeNull());
  });

  it("compares two versions: added, removed, changed; keeps only the last two picks", async () => {
    list([ver(3), ver(2), ver(1)]);
    asRole("viewer");
    getVersion({
      1: doc(
        [
          { id: "a", label: "A" },
          { id: "b", label: "B" },
        ],
        [{ id: "e1", label: "old" }],
      ),
      2: doc(
        [
          { id: "a", label: "A2" },
          { id: "c", label: "C" },
        ],
        [
          { id: "e1", label: "old" },
          { id: "e2", label: "new" },
        ],
      ),
      3: doc([{ id: "a", label: "A" }]),
    });
    const { user } = await open();
    const box = async (v: number) => screen.findByRole("checkbox", { name: `Compare v${v}` });
    await user.click(await box(2));
    await user.click(await box(1));
    expect(await screen.findByText("v1 to v2")).toBeInTheDocument();
    expect(await screen.findByText("C")).toBeInTheDocument();
    expect(screen.getByText("B")).toBeInTheDocument();
    expect(screen.getByText("Nodes")).toBeInTheDocument();
    expect(screen.getByText("Edges")).toBeInTheDocument();
    await user.click(await box(3)); // third pick drops the oldest (v2)
    expect(await screen.findByText("v1 to v3")).toBeInTheDocument();
    await user.click(await box(1)); // unpick
    expect(screen.queryByText(/ to v/)).toBeNull();
  });

  it("says when two versions are identical, and when comparing fails", async () => {
    list([ver(2), ver(1)]);
    asRole("viewer");
    getVersion({ 1: doc([{ id: "a", label: "A" }]), 2: doc([{ id: "a", label: "A" }]) });
    const { user } = await open();
    await user.click(await screen.findByRole("checkbox", { name: "Compare v1" }));
    await user.click(screen.getByRole("checkbox", { name: "Compare v2" }));
    expect(await screen.findByText("No structural changes on the first page.")).toBeInTheDocument();
  });

  it("compare error", async () => {
    list([ver(2), ver(1)]);
    asRole("viewer");
    server.use(http.get(api("/diagrams/files/f1/versions/:v"), () => HttpResponse.json({ error: { message: "x" } }, { status: 500 })));
    const { user } = await open();
    await user.click(await screen.findByRole("checkbox", { name: "Compare v1" }));
    await user.click(screen.getByRole("checkbox", { name: "Compare v2" }));
    expect(await screen.findByText("Couldn't compare these versions.")).toBeInTheDocument();
  });
});

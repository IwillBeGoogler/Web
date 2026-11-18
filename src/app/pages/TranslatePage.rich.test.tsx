import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePost, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { TranslatePage } from "./TranslatePage";

// a stand-in visual editor: buttons drive each callback the page hands it
vi.mock("@/contexts/publishing/rich/RichEditor", () => ({
  default: ({
    value,
    onChange,
    onLossy,
    onDiagram,
  }: {
    value: string;
    onChange: (s: string) => void;
    onLossy: (p: unknown) => void;
    onDiagram: () => void;
  }) => {
    if (value === "CRASH") throw new Error("rich down");
    return (
      <div data-testid="rich">
        <span>rich:{value}</span>
        <button type="button" onClick={() => onChange("visual text")}>
          type
        </button>
        <button type="button" onClick={() => onLossy({ kind: "x" })}>
          lossy
        </button>
        <button type="button" onClick={() => onLossy(null)}>
          clean
        </button>
        <button type="button" onClick={() => onDiagram()}>
          diagram
        </button>
      </div>
    );
  },
}));

function mount(post: Record<string, unknown> = {}) {
  signIn();
  server.use(http.get(api("/posts/1"), () => HttpResponse.json({ data: makePost({ title: "Asl", subtitle: "Kichik", body: "Matn", ...post }) })));
  return renderRouted(<TranslatePage id={1} />);
}

describe("TranslatePage visual mode", () => {
  beforeEach(() => localStorage.removeItem("translate-mode"));

  it("starts from the original, edits visually, blocks save while lossy, saves with Ctrl+S", async () => {
    let saved: unknown;
    server.use(
      http.put(api("/posts/1/translations/ru"), async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json({ data: { post_id: 1, lang: "ru", title: "Asl", subtitle: "Kichik", body: "visual text", updated_at: "x" } });
      }),
    );
    await mount();
    fireEvent.click(await screen.findByRole("button", { name: "Start from original" }));
    expect(await screen.findByText("rich:Matn")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Start from original" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "type" }));
    fireEvent.click(screen.getByRole("button", { name: "diagram" }));
    fireEvent.click(screen.getByRole("button", { name: "lossy" }));
    expect(screen.getByRole("status")).toHaveTextContent(/Switch to Markdown/);
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("main"), { key: "s", ctrlKey: true });
    fireEvent.click(screen.getByRole("button", { name: "clean" }));
    fireEvent.keyDown(screen.getByRole("main"), { key: "x", ctrlKey: true });
    expect(saved).toBeUndefined();
    fireEvent.keyDown(screen.getByRole("main"), { key: "s", metaKey: true });
    await waitFor(() => expect(saved).toEqual({ title: "Asl", subtitle: "Kichik", body: "visual text" }));
  });

  it("falls back to Markdown when the visual editor crashes", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    await mount({ body: "CRASH" });
    fireEvent.click(await screen.findByRole("button", { name: "Start from original" }));
    expect(await screen.findByLabelText("Body (Markdown)")).toHaveValue("CRASH");
    expect(screen.getByRole("button", { name: "Markdown" })).toHaveAttribute("aria-pressed", "true");
  });

  it("survives blocked storage and renders a post without body_html", async () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    await mount({ body_html: undefined, subtitle: "" });
    fireEvent.click(await screen.findByRole("button", { name: "Markdown" }));
    expect(screen.getByLabelText("Body (Markdown)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Visual" }));
    expect(await screen.findByTestId("rich")).toBeInTheDocument();
    server.use(http.post(api("/posts/preview"), () => HttpResponse.json({ data: { body_html: "<p>shown</p>" } })));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("shown")).toBeInTheDocument();
    get.mockRestore();
    set.mockRestore();
  });
});

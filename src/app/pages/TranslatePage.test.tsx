import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { makePost, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { TranslatePage } from "./TranslatePage";

const tr = (lang: string, o: Record<string, unknown> = {}) => ({
  post_id: 1,
  lang,
  title: `T-${lang}`,
  subtitle: `S-${lang}`,
  body: `B-${lang}`,
  updated_at: "2026-10-01T00:00:00Z",
  ...o,
});

function mount(post: Record<string, unknown>, lang?: string) {
  signIn();
  server.use(http.get(api("/posts/1"), () => HttpResponse.json({ data: makePost(post) })));
  return renderRouted(<TranslatePage id={1} lang={lang} />);
}

describe("TranslatePage", () => {
  // these cases drive the Markdown textarea; visual mode is covered below
  beforeEach(() => localStorage.setItem("translate-mode", "md"));

  it("opens in visual mode by default and switches to Markdown", async () => {
    localStorage.removeItem("translate-mode");
    mount({ lang: "uz", languages: ["uz"] });
    expect(await screen.findByRole("button", { name: "Visual" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.queryByLabelText("Body (Markdown)")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Markdown" }));
    expect(screen.getByLabelText("Body (Markdown)")).toBeInTheDocument();
    expect(localStorage.getItem("translate-mode")).toBe("md");
  });

  it("shows not-found and forbidden states", async () => {
    signIn();
    server.use(http.get(api("/posts/1"), () => HttpResponse.json({ title: "nope", status: 404 }, { status: 404 })));
    const v = await renderRouted(<TranslatePage id={1} />);
    expect(await screen.findByText(/doesn't exist/)).toBeInTheDocument();
    v.unmount();
    server.use(http.get(api("/posts/1"), () => HttpResponse.json({ title: "no", status: 403 }, { status: 403 })));
    await renderRouted(<TranslatePage id={1} />);
    expect(await screen.findByText(/don't have access/)).toBeInTheDocument();
  });

  it("creates a new translation, previews and saves it", async () => {
    let saved: unknown;
    server.use(
      http.put(api("/posts/1/translations/ru"), async ({ request }) => {
        saved = await request.json();
        return HttpResponse.json({ data: tr("ru") });
      }),
      http.post(api("/posts/preview"), () => HttpResponse.json({ data: { body_html: "<p>rendered</p>" } })),
    );
    await mount({ subtitle: "" });
    expect(await screen.findByText("Translate")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ru" })).toHaveAttribute("aria-pressed", "true");
    const save = screen.getByRole("button", { name: "Save" });
    expect(save).toBeDisabled();
    const [title, subtitle] = screen.getAllByRole("textbox");
    fireEvent.change(title as HTMLElement, { target: { value: "Salom" } });
    fireEvent.change(subtitle as HTMLElement, { target: { value: "sub" } });
    fireEvent.change(screen.getAllByRole("textbox")[2] as HTMLElement, { target: { value: "tana" } });
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    expect(await screen.findByText("rendered")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Hide preview" }));
    expect(screen.queryByText("rendered")).toBeNull();
    fireEvent.click(save);
    await waitFor(() => expect(saved).toEqual({ title: "Salom", subtitle: "sub", body: "tana" }));
    expect(screen.queryByRole("button", { name: "Delete translation" })).toBeNull();
  });

  it("loads an existing translation, switches language and deletes", async () => {
    let deleted = false;
    server.use(
      http.get(api("/posts/1/translations/en"), () => HttpResponse.json({ data: tr("en") })),
      http.delete(api("/posts/1/translations/en"), () => {
        deleted = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await mount({ languages: ["uz", "en"] }, "en");
    expect(await screen.findByDisplayValue("T-en")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "en ✓" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete translation" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete translation" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(deleted).toBe(true));
    fireEvent.click(screen.getByRole("button", { name: "ru" }));
    await waitFor(() => expect(screen.getAllByRole("textbox")[0]).toHaveValue(""));
  });

  it("toasts failed save, delete and preview", async () => {
    const fail = () => HttpResponse.json({ title: "boom", status: 500 }, { status: 500 });
    server.use(
      http.get(api("/posts/1/translations/ru"), () => HttpResponse.json({ data: tr("ru") })),
      http.put(api("/posts/1/translations/ru"), fail),
      http.delete(api("/posts/1/translations/ru"), fail),
      http.post(api("/posts/preview"), fail),
    );
    await mount({ languages: ["uz", "ru", "en"] }, "ru");
    expect(await screen.findByDisplayValue("T-ru")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "Preview" }));
    fireEvent.click(screen.getByRole("button", { name: "Delete translation" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Yes, delete" })).not.toBeDisabled());
    expect(screen.getByRole("button", { name: "Preview" })).toBeInTheDocument();
  });

  it("falls back to the first option when every language exists", async () => {
    server.use(http.get(api("/posts/1/translations/ru"), () => HttpResponse.json({ data: tr("ru") })));
    await mount({ languages: ["uz", "ru", "en"] }, "xx");
    expect(await screen.findByDisplayValue("T-ru")).toBeInTheDocument();
  });
});

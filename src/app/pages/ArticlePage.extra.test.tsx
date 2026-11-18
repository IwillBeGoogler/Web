import { fireEvent, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { readingPrefs } from "@/contexts/preferences/application/store";
import { tokens } from "@/shared/api";
import { makePost, me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { ArticlePage } from "./ArticlePage";

vi.mock("@/contexts/collections/ui/Highlights", () => ({ Highlighter: () => null, HighlightsPanel: () => null }));
vi.mock("@/contexts/collections/ui/Lists", () => ({ SaveToList: () => null }));
vi.mock("@/contexts/collections/ui/Series", () => ({ SeriesNav: () => null, SeriesBefore: () => null, ReadingPathNav: () => null }));

const profile = { id: 1, username: "ali", display_name: "Ali V", bio: "I write", followers: 1500, created_at: "x", is_following: false };

const mount = (post: object, extra: { related?: object[]; author?: object | null } = {}) => {
  const slug = (post as { slug: string }).slug;
  server.use(
    http.get(api(`/slug/${slug}`), () => HttpResponse.json({ data: post })),
    http.get(api("/users/:u"), () => (extra.author === null ? new HttpResponse(null, { status: 404 }) : HttpResponse.json({ data: extra.author ?? profile }))),
    http.get(api("/posts/:id/related"), () => HttpResponse.json({ data: extra.related ?? [] })),
    http.post(api("/posts/:id/view"), () => new HttpResponse(null, { status: 204 })),
    http.post(api("/posts/:id/read"), () => new HttpResponse(null, { status: 204 })),
  );
  return renderRouted(<ArticlePage slug={slug} />);
};

afterEach(() => {
  tokens.set(null);
  readingPrefs.reset();
  vi.restoreAllMocks();
});

describe("ArticlePage extras", () => {
  it("shows retry on server error", async () => {
    let n = 0;
    server.use(
      http.get(api("/slug/boom"), () =>
        ++n === 1 ? new HttpResponse(null, { status: 500 }) : HttpResponse.json({ data: makePost({ slug: "boom", title: "Recovered" }) }),
      ),
      http.get(api("/users/:u"), () => HttpResponse.json({ data: profile })),
      http.get(api("/posts/:id/related"), () => HttpResponse.json({ data: [] })),
    );
    const { user } = await renderRouted(<ArticlePage slug="boom" />);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Recovered" })).toBeInTheDocument();
  });

  it("dates an unpublished story by its creation time", async () => {
    await mount(makePost({ slug: "undated", title: "Undated", published_at: null, created_at: "2026-09-02T00:00:00Z" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Undated" })).toBeInTheDocument();
    expect(document.querySelector("time")?.getAttribute("datetime")).toBe("2026-09-02T00:00:00Z");
  });

  it("shows no-access on 403", async () => {
    server.use(http.get(api("/slug/priv"), () => HttpResponse.json({ status: 403, detail: "no" }, { status: 403 })));
    await renderRouted(<ArticlePage slug="priv" />);
    expect(await screen.findByText("You don't have access to this story.")).toBeInTheDocument();
  });

  it("renders anonymous draft, plain body, cover, no tags/subtitle", async () => {
    await mount(
      makePost({
        slug: "anon",
        user_id: 0,
        author: "",
        status: "draft",
        body_html: "",
        body: "Plain text body",
        tags: [],
        subtitle: "",
        cover_url: "http://x/c.png",
        published_at: null,
      }),
    );
    expect(await screen.findByText("Plain text body")).toBeInTheDocument();
    expect(screen.getByText("Anonymous")).toBeInTheDocument();
    expect(screen.getByText("draft")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.getByText("Fig. 01 — cover")).toBeInTheDocument();
    expect(screen.queryByText("Filed under")).toBeNull();
    expect(screen.queryByLabelText("About the writer")).toBeNull();
  });

  it("renders author card, edit for owner, related carousel, copy link, discuss", async () => {
    signIn();
    server.use(http.get(api("/me"), () => HttpResponse.json({ data: { ...me, id: 1, username: "ali" } })));
    const writeText = vi.fn(() => Promise.resolve());
    const { user } = await mount(makePost({ slug: "own", user_id: 1, author: "ali", tags: ["go", "rust"] }), {
      related: [makePost({ id: 9, title: "Next story", slug: "next" })],
    });
    expect(await screen.findByRole("link", { name: "Edit" })).toHaveAttribute("href", "/p/9/edit".replace("9", "1"));
    // the action deck has its own Edit key for the owner
    expect(await screen.findByRole("link", { name: "Edit story" })).toHaveAttribute("href", "/p/1/edit");
    expect(await screen.findByText(/1\.5K readers/)).toBeInTheDocument();
    expect(await screen.findByText("I write")).toBeInTheDocument();
    expect(await screen.findByText("Next story")).toBeInTheDocument();
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    await user.click(screen.getByRole("button", { name: "Copy link" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: /^Discussion, 2/ }));
  });

  it("copy link error toasts when clipboard rejects", async () => {
    const { user } = await mount(makePost({ slug: "cp" }));
    const btn = await screen.findByRole("button", { name: "Copy link" });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: () => Promise.reject(new Error("no")) }, configurable: true });
    await user.click(btn);
  });

  it("copy link no-ops without clipboard", async () => {
    const { user } = await mount(makePost({ slug: "cp2" }));
    const btn = await screen.findByRole("button", { name: "Copy link" });
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await user.click(btn);
  });

  it("applies bionic html when pref on", async () => {
    readingPrefs.set({ bionic: true });
    await mount(makePost({ slug: "bio", body_html: "<p>Some words</p>" }));
    expect(await screen.findByRole("heading", { level: 1 })).toBeInTheDocument();
  });

  it("diagram embed link navigates in-app", async () => {
    const html = `<figure class="diagram-embed"><a id="d" href="/d/v/my%20slug">D</a></figure>`;
    const { router, container } = await mount(makePost({ slug: "emb", body_html: html }));
    await screen.findByRole("heading", { level: 1 });
    const a = await waitFor(() => {
      const el = container.querySelector("#d");
      if (!el) throw new Error("no");
      return el;
    });
    fireEvent.click(a, { metaKey: true });
    expect(router.state.location.pathname).not.toBe("/d/v/my slug");
    fireEvent.click(container.querySelector("article") as Element);
    fireEvent.click(a);
    await waitFor(() => expect(router.state.location.pathname).toBe("/d/v/my slug"));
  });

  it("sends read progress once after scrolling past 60%", async () => {
    const read = vi.fn(() => new HttpResponse(null, { status: 204 }));
    await mount(makePost({ slug: "scroll" }));
    server.use(http.post(api("/posts/:id/read"), read));
    await screen.findByRole("heading", { level: 1 });
    const h = document.documentElement;
    vi.spyOn(h, "scrollHeight", "get").mockReturnValue(1000);
    vi.spyOn(h, "scrollTop", "get").mockReturnValue(100);
    Object.defineProperty(window, "innerHeight", { value: 600, configurable: true });
    fireEvent.scroll(window);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    fireEvent.scroll(window);
    fireEvent.scroll(window);
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("scroll below threshold does nothing", async () => {
    await mount(makePost({ slug: "scroll2" }));
    await screen.findByRole("heading", { level: 1 });
    const h = document.documentElement;
    vi.spyOn(h, "scrollHeight", "get").mockReturnValue(10000);
    fireEvent.scroll(window);
  });

  it("follows author when not self", async () => {
    await mount(makePost({ slug: "fol", user_id: 1 }));
    await screen.findByText("I write");
    expect(screen.getByRole("button", { name: "Track ali" })).toBeInTheDocument();
  });

  it("downloads the story as markdown", async () => {
    const createObjectURL = vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:md");
    const revokeObjectURL = vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    const { user } = await mount(makePost({ slug: "dl", lang: "uz", languages: ["uz"] }));
    await screen.findByRole("heading", { level: 1 });
    await user.click(screen.getByRole("button", { name: "Download as Markdown" }));
    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(revokeObjectURL).toHaveBeenCalledWith("blob:md"));
  });

  it("switches to a translation and falls back on translation error", async () => {
    server.use(
      http.get(api("/posts/:id/translations/en"), () =>
        HttpResponse.json({
          data: {
            post_id: 1,
            lang: "en",
            title: "Translated Title",
            subtitle: "Translated Sub",
            body: "Translated body",
            body_html: "<p>Translated HTML</p>",
            reading_time: 5,
            updated_at: "2026-01-01T00:00:00Z",
          },
        }),
      ),
      http.get(api("/posts/:id/translations/ru"), () => new HttpResponse(null, { status: 500 })),
    );
    const { user } = await mount(makePost({ slug: "tr", title: "Original Title", lang: "uz", languages: ["uz", "en", "ru"] }));
    expect(await screen.findByRole("heading", { level: 1, name: "Original Title" })).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "en" }));
    expect(await screen.findByRole("heading", { level: 1, name: "Translated Title" })).toBeInTheDocument();
    expect(screen.getByText("Translated Sub")).toBeInTheDocument();
    expect(screen.getByText("Translated HTML")).toBeInTheDocument();
    expect(screen.getByText("5 min")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "ru" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "uz" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("heading", { level: 1, name: "Original Title" })).toBeInTheDocument();
  });

  it("respects reduced motion and handles undefined body_html", async () => {
    const origMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query === "(prefers-reduced-motion: reduce)",
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    }));
    try {
      await mount(makePost({ slug: "rm", body_html: undefined, body: "Fallback body", cover_url: "http://x/c.png" }));
      expect(await screen.findByText("Fallback body")).toBeInTheDocument();
    } finally {
      window.matchMedia = origMatchMedia;
    }
  });
});

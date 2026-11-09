import { fireEvent, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { makePost, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { HomePage } from "./HomePage";

const base = () =>
  server.use(
    http.get(api("/posts/trending"), () => HttpResponse.json({ data: [makePost({ title: "Hot story" })] })),
    http.get(api("/tags"), () => HttpResponse.json({ data: [{ name: "go", count: 3 }] })),
    http.get(api("/posts"), () => HttpResponse.json({ data: [], meta: {} })),
    http.get(api("/me/for-you"), () => HttpResponse.json({ data: [], meta: {} })),
    http.get(api("/me/suggestions/users"), () => HttpResponse.json({ data: [] })),
    http.get(api("/me/bookmarks"), () => HttpResponse.json({ data: [], meta: {} })),
    http.get(api("/me/posts"), () => HttpResponse.json({ data: [], meta: {} })),
    http.get(api("/diagrams/templates"), () => HttpResponse.json({ data: [] })),
    http.get(api("/diagrams/public"), () => HttpResponse.json({ data: [], meta: {} })),
  );

describe("landing", () => {
  it("shows the hero, trending and topics to signed-out visitors", async () => {
    base();
    await renderRouted(<HomePage tab={undefined} />);
    expect(screen.getByRole("heading", { level: 1, name: /Ideas worth/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open the stream/ })).toHaveAttribute("href", "/?tab=latest");
    expect((await screen.findAllByText("Hot story")).length).toBeGreaterThan(0);
    expect((await screen.findAllByRole("link", { name: "go" })).length).toBeGreaterThan(0);
  });
  it("shows the diagram feature sections and the draw CTA", async () => {
    base();
    await renderRouted(<HomePage tab={undefined} />);
    expect(screen.getByRole("heading", { level: 3, name: "System design diagrams" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Database (ERD) diagrams" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Object-oriented (UML) diagrams" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: /Put the diagram/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Draw a diagram" })).toBeInTheDocument();
  });
  it("hides the template and recent sections when there is nothing", async () => {
    base();
    await renderRouted(<HomePage tab={undefined} />);
    await screen.findAllByText("Hot story");
    expect(screen.queryByRole("heading", { name: "Start from a template" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Fresh from the editor" })).toBeNull();
  });
  it("hides them on error", async () => {
    base();
    server.use(
      http.get(api("/diagrams/templates"), () => new HttpResponse(null, { status: 500 })),
      http.get(api("/diagrams/public"), () => new HttpResponse(null, { status: 500 })),
    );
    await renderRouted(<HomePage tab={undefined} />);
    await screen.findAllByText("Hot story");
    expect(screen.queryByRole("heading", { name: "Start from a template" })).toBeNull();
  });
  it("teases up to six templates, filters by kind and links on", async () => {
    base();
    const tpls = Array.from({ length: 8 }, (_, i) => ({
      id: `t${i}`,
      title: `Tpl ${i}`,
      kind: i < 7 ? "system" : "db",
      description: "d",
      thumbnail_url: null,
      page_count: 1,
    }));
    server.use(http.get(api("/diagrams/templates"), () => HttpResponse.json({ data: tpls })));
    await renderRouted(<HomePage tab={undefined} />);
    expect(await screen.findByRole("heading", { name: "Start from a template" })).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: /^Tpl \d$/ })).toHaveLength(6);
    expect(screen.getAllByRole("link", { name: /^Tpl \d$/ })[0]).toHaveAttribute("href", "/templates");
    fireEvent.click(screen.getByRole("button", { name: "DB" }));
    expect(screen.getAllByRole("link", { name: /^Tpl \d$/ })).toHaveLength(1);
    expect(screen.getByRole("link", { name: /Browse all templates/ })).toHaveAttribute("href", "/templates");
  });
  it("shows recent public diagrams", async () => {
    base();
    const d = {
      file_id: "f1",
      slug: "url-shortener",
      title: "My URL shortener",
      description: "",
      tags: [],
      visibility: "public",
      kind: "sdd",
      page_count: 1,
      thumbnail_url: null,
      published_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      author: { id: 1, username: "ann", display_name: "Ann", avatar_url: "" },
    };
    server.use(http.get(api("/diagrams/public"), () => HttpResponse.json({ data: [d], meta: { total: 1 } })));
    await renderRouted(<HomePage tab={undefined} />);
    expect(await screen.findByRole("link", { name: "My URL shortener" })).toHaveAttribute("href", "/d/v/url-shortener");
  });
  it("signed-out readers who pick a tab get the feed", async () => {
    base();
    await renderRouted(<HomePage tab="latest" />);
    expect(screen.queryByRole("heading", { level: 1, name: /Human stories/ })).toBeNull();
    expect(screen.getByRole("radio", { name: "Newest" })).toBeInTheDocument();
  });
  it("signed-in readers never see the landing page", async () => {
    signIn();
    base();
    await renderRouted(<HomePage tab={undefined} />);
    expect(await screen.findByRole("radio", { name: "Picked for you" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: /Human stories/ })).toBeNull();
    tokens.set(null);
  });
});

describe("landing CTAs", () => {
  it("every signup CTA opens the auth dialog", async () => {
    base();
    const { authDialog } = await import("@/contexts/identity/application/authDialog");
    const spy = vi.spyOn(authDialog, "open");
    const { LandingPage } = await import("./LandingPage");
    await renderRouted(<LandingPage />);
    for (const name of ["Start a draft", "Draw a diagram", "Create your account"]) {
      for (const b of screen.getAllByRole("button", { name })) fireEvent.click(b);
    }
    expect(spy).toHaveBeenCalledWith("signup");
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(3);
    expect(screen.getByRole("link", { name: "Browse newest" })).toBeInTheDocument();
    spy.mockRestore();
  });
});

import { infiniteQueryOptions } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Page } from "@/shared/http";
import { renderRouted } from "@/test/render";
import type { PublicDiagram } from "../domain/diagram";
import { DiagramList } from "./DiagramList";

const diagram = (slug: string): PublicDiagram => ({
  file_id: `f-${slug}`,
  slug,
  title: `Title ${slug}`,
  description: "",
  tags: [],
  visibility: "public",
  kind: "sdd",
  page_count: 1,
  thumbnail_url: null,
  claps: 0,
  views: 0,
  published_at: "2026-10-01T00:00:00Z",
  updated_at: "2026-10-01T00:00:00Z",
  author: { id: 1, username: "ali", display_name: "Ali", avatar_url: "" },
});
const meta = (hasMore: boolean, page = 1) => ({ page, limit: 1, total: 2, hasMore, nextCursor: undefined });

const query = (key: string, fn: (page: number) => Promise<Page<PublicDiagram>>) =>
  infiniteQueryOptions({
    queryKey: ["dl-test", key],
    queryFn: ({ pageParam }) => fn(pageParam),
    initialPageParam: 1,
    getNextPageParam: (l: Page<PublicDiagram>) => (l.meta.hasMore ? l.meta.page + 1 : undefined),
  });

describe("DiagramList", () => {
  it("shows a skeleton while pending", async () => {
    await renderRouted(<DiagramList query={query("pending", () => new Promise(() => {}))} empty={{ title: "None" }} />);
    expect(screen.getByText("Loading")).toBeInTheDocument();
    await waitFor(() => expect(document.querySelectorAll("li.tile").length).toBe(2));
  });

  it("shows an error and retries", async () => {
    let fail = true;
    const q = query("err", async () => {
      if (fail) throw new Error("boom");
      return { items: [diagram("a")], meta: meta(false) };
    });
    const { user } = await renderRouted(<DiagramList query={q} empty={{ title: "None" }} />);
    expect(await screen.findByText("Couldn't load diagrams.")).toBeInTheDocument();
    fail = false;
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Title a")).toBeInTheDocument();
  });

  it("shows the empty state, with and without a custom icon", async () => {
    const q = query("empty", async () => ({ items: [], meta: meta(false) }));
    await renderRouted(<DiagramList query={q} empty={{ title: "Nothing yet" }} />);
    expect(await screen.findByText("Nothing yet")).toBeInTheDocument();
    const Icon = () => <svg data-testid="custom-icon" />;
    await renderRouted(<DiagramList query={query("empty2", async () => ({ items: [], meta: meta(false) }))} empty={{ title: "Zip", icon: Icon as never }} />);
    expect(await screen.findByText("Zip")).toBeInTheDocument();
    expect(screen.getByTestId("custom-icon")).toBeInTheDocument();
  });

  it("lists cards and pages with show more", async () => {
    const q = query("pages", async (page) => ({ items: [diagram(`s${page}`)], meta: meta(page < 2, page) }));
    const { user } = await renderRouted(<DiagramList query={q} empty={{ title: "None" }} byline />);
    expect(await screen.findByText("Title s1")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show more" }));
    expect(await screen.findByText("Title s2")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Show more" })).toBeNull());
  });
});

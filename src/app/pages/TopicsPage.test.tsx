import { screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { page } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { TopicPage, TopicsPage } from "./TopicsPage";

const rows = [
  { id: 1, parent_id: 0, slug: "system-design", name: "System Design", names: { uz: "Tizim dizayni" }, position: 0, count: 1 },
  { id: 2, parent_id: 1, slug: "caching", name: "Caching", names: {}, position: 0, count: 4 },
];

describe("topics", () => {
  it("/topics lists roots with subtopic chips and subtree totals", async () => {
    server.use(http.get(api("/categories"), () => HttpResponse.json({ data: rows })));
    await renderRouted(<TopicsPage />, { path: "/topics" });
    expect(await screen.findByRole("heading", { name: "System Design" })).toBeInTheDocument();
    expect(screen.getByText(/5 stories/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Caching" })).toHaveAttribute("href", "/topics/caching");
  });

  it("/topics/:slug shows breadcrumb and the topic's stories", async () => {
    server.use(
      http.get(api("/categories"), () => HttpResponse.json({ data: rows })),
      http.get(api("/categories/2/posts"), () => page([])),
    );
    await renderRouted(<TopicPage slug="caching" />, { path: "/topics/caching" });
    expect(await screen.findByRole("heading", { name: "Caching" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "System Design" })).toHaveAttribute("href", "/topics/system-design");
    expect(await screen.findByText("No stories in this topic yet.")).toBeInTheDocument();
  });

  it("/topics caps subtopic chips at 8 and shows the rest as a count", async () => {
    const kids = Array.from({ length: 10 }, (_, i) => ({ id: 10 + i, parent_id: 1, slug: `k${i}`, name: `Kid ${i}`, names: {}, position: i, count: 0 }));
    server.use(http.get(api("/categories"), () => HttpResponse.json({ data: [rows[0], ...kids] })));
    await renderRouted(<TopicsPage />, { path: "/topics" });
    expect(await screen.findByText("+2")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Kid 9" })).toBeNull();
  });

  it("/topics/:slug lists subtopics as links with their totals", async () => {
    server.use(
      http.get(api("/categories"), () => HttpResponse.json({ data: rows })),
      http.get(api("/categories/1/posts"), () => page([])),
    );
    await renderRouted(<TopicPage slug="system-design" />, { path: "/topics/system-design" });
    const sub = await screen.findByRole("link", { name: /Caching/ });
    expect(sub).toHaveAttribute("href", "/topics/caching");
    expect(sub).toHaveTextContent("4 stories");
  });

  const lone = { id: 7, parent_id: 0, slug: "lone", name: "Lone", names: { uz: "Yolg‘iz" }, description: "Only one.", position: 0, count: 0 };

  it("a root without subtopics shows no chips", async () => {
    server.use(http.get(api("/categories"), () => HttpResponse.json({ data: [lone] })));
    await renderRouted(<TopicsPage />, { path: "/topics" });
    expect(await screen.findByRole("heading", { name: "Lone" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(1);
  });

  it("a topic shows its description", async () => {
    server.use(
      http.get(api("/categories"), () => HttpResponse.json({ data: [lone] })),
      http.get(api("/categories/7/posts"), () => page([])),
    );
    await renderRouted(<TopicPage slug="lone" />, { path: "/topics/lone" });
    expect(await screen.findByText("Only one.")).toBeInTheDocument();
  });

  it("unknown slug says so", async () => {
    server.use(http.get(api("/categories"), () => HttpResponse.json({ data: rows })));
    await renderRouted(<TopicPage slug="nope" />, { path: "/topics/nope" });
    expect(await screen.findByText("Topic not found")).toBeInTheDocument();
  });
});

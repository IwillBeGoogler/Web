import { fireEvent, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { makePost } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { Feed } from "./Feed";
import { PostCard } from "./PostCard";
import { TopicChips } from "./TopicChips";

describe("PostCard variants", () => {
  it("renders a bare story: no index, no tags, no author, no stats, no cover", async () => {
    await renderRouted(<PostCard post={makePost({ tags: [], author: "", user_id: 0, claps: 0, comments_count: 0, cover_url: "", subtitle: "" }) as never} />);
    expect(screen.getByText("Story")).toBeInTheDocument();
    expect(document.querySelector("[data-cover]")).toBeNull();
    expect(screen.queryByText(/sparks/)).toBeNull();
  });
  it("renders index, tag, subtitle, stats, cover and hides a broken cover", async () => {
    await renderRouted(
      <PostCard index={4} post={makePost({ tags: ["go", "db"], subtitle: "Sub", claps: 5, comments_count: 3, cover_url: "/c.png" }) as never} />,
    );
    expect(screen.getByText("05")).toBeInTheDocument();
    expect(screen.getByText("Sub")).toBeInTheDocument();
    expect(screen.getByText(/responses/)).toBeInTheDocument();
    const img = document.querySelector("[data-cover] img") as HTMLImageElement;
    fireEvent.error(img);
    expect((document.querySelector("[data-cover]") as HTMLElement).hidden).toBe(true);
  });
  it("shows a plain-text author when the user id is unknown", async () => {
    await renderRouted(<PostCard post={makePost({ author: "ghost", user_id: 0 }) as never} />);
    expect(screen.getByText("@ghost").closest("a")).toBeNull();
  });
});

describe("PostCard edges", () => {
  it("falls back to created_at when unpublished and omits empty text", async () => {
    await renderRouted(<PostCard post={makePost({ published_at: null, subtitle: "", body: "", created_at: "2026-09-05T00:00:00Z" }) as never} />);
    expect(document.querySelector("time")).toHaveAttribute("datetime", "2026-09-05T00:00:00Z");
    expect(document.querySelector("a p")).toBeNull();
  });
  it("survives a cover error when the image is no longer inside its cell", async () => {
    await renderRouted(<PostCard post={makePost({ cover_url: "/c.png" }) as never} />);
    const img = document.querySelector("[data-cover] img") as HTMLImageElement;
    const cell = document.querySelector("[data-cover]") as HTMLElement;
    document.body.appendChild(img);
    fireEvent.error(img);
    expect(cell.hidden).toBe(false);
    img.remove();
  });
});

describe("TopicChips", () => {
  it("renders nothing for no tags, and counts, current and wrap otherwise", async () => {
    const { container } = await renderRouted(<TopicChips tags={[]} />);
    expect(container.querySelector("nav")).toBeNull();
    await renderRouted(<TopicChips tags={["a", "b"]} current="a" wrap counts={{ a: 1500 }} />);
    expect(await screen.findByText("1.5K")).toBeInTheDocument();
    await renderRouted(<TopicChips tags={["c"]} />);
  });
});

describe("Feed states", () => {
  it("shows an error with retry and an empty state with defaults", async () => {
    server.use(http.get(api("/posts"), () => HttpResponse.json({}, { status: 500 })));
    const { user } = await renderRouted(<Feed source={{ kind: "latest" }} />);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    server.use(http.get(api("/posts"), () => HttpResponse.json({ data: [] })));
    await renderRouted(<Feed source={{ kind: "latest" }} />);
    expect(await screen.findAllByText("No stories yet.")).not.toHaveLength(0);
  });
});

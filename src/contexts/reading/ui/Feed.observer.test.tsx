import { screen, waitFor } from "@testing-library/react";
import { http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { makePost, page } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { Feed } from "./Feed";

describe("Feed infinite scroll", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("loads the next page when the end scrolls into view, not otherwise", async () => {
    let cb: ((e: { isIntersecting: boolean }[]) => void) | undefined;
    vi.stubGlobal(
      "IntersectionObserver",
      class {
        constructor(c: typeof cb) {
          cb = c;
        }
        observe() {}
        unobserve() {}
        disconnect() {}
      },
    );
    let calls = 0;
    server.use(
      http.get(api("/posts"), ({ request }) => {
        calls++;
        return new URL(request.url).searchParams.get("cursor")
          ? page([makePost({ id: 2, title: "Second", slug: "s" })])
          : page([makePost()], { has_more: true, next_cursor: "c2" });
      }),
    );
    await renderRouted(<Feed source={{ kind: "latest" }} />);
    await screen.findByRole("button", { name: /Show more/ });
    cb?.([{ isIntersecting: false }]);
    cb?.([]);
    expect(calls).toBe(1);
    cb?.([{ isIntersecting: true }]);
    await waitFor(() => expect(calls).toBe(2));
    expect(await screen.findByText("Second")).toBeInTheDocument();
  });
});

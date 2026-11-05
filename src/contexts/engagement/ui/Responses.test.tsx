import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { tokens } from "@/shared/api";
import { page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { Responses } from "./Responses";

const c = (id: number, parent_id = 0, text = `c${id}`) => ({
  id,
  post_id: 1,
  parent_id,
  user_id: 9,
  author: "vali",
  text,
  created_at: `2026-10-0${id}T00:00:00Z`,
});

describe("Responses", () => {
  it("threads replies under their parent", async () => {
    server.use(http.get(api("/posts/1/comments"), () => page([c(2, 1, "a reply"), c(1, 0, "top level")])));
    await renderRouted(<Responses postId={1} count={2} open onOpenChange={() => {}} />);
    expect(await screen.findByText("top level")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1 reply" })).toBeInTheDocument();
    expect(screen.getByText("a reply")).toBeInTheDocument();
  });

  it("posts a response and refreshes", async () => {
    signIn();
    let list = [c(1)];
    server.use(
      http.get(api("/posts/1/comments"), () => page(list)),
      http.post(api("/posts/1/comments"), async ({ request }) => {
        const b = (await request.json()) as { text: string };
        list = [...list, c(2, 0, b.text)];
        return HttpResponse.json({ data: list[1] }, { status: 201 });
      }),
    );
    const { user } = await renderRouted(<Responses postId={1} count={1} open onOpenChange={() => {}} />);
    await user.type(await screen.findByLabelText("Write a note"), "Great story");
    await user.click(screen.getByRole("button", { name: "Post note" }));
    await waitFor(() => expect(screen.getByText("Great story")).toBeInTheDocument());
    tokens.set(null);
  });

  it("shows the empty state", async () => {
    server.use(http.get(api("/posts/1/comments"), () => page([])));
    await renderRouted(<Responses postId={1} count={0} open onOpenChange={() => {}} />);
    expect(await screen.findByText(/0 notes\. Start the discussion/)).toBeInTheDocument();
  });
});

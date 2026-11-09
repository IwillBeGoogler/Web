import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it } from "vitest";
import { tokens } from "@/shared/api";
import { page, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { TagPage } from "./TagPage";

describe("TagPage", () => {
  it("signed out: shows topic and empty feed", async () => {
    server.use(http.get(api("/posts"), () => page([])));
    await renderRouted(<TagPage tag="go" />, { path: "/tag/go" });
    expect(screen.getByRole("heading", { name: "go" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Add to feed" })).toHaveAttribute("aria-pressed", "false");
    expect(await screen.findByText(/No stories tagged/)).toBeInTheDocument();
  });

  it("signed in: follow then unfollow", async () => {
    signIn();
    const methods: string[] = [];
    server.use(
      http.get(api("/posts"), () => page([])),
      http.get(api("/me/tags"), () => HttpResponse.json({ data: methods.length % 2 ? ["go"] : [] })),
      http.all(api("/tags/go/follow"), ({ request }) => {
        methods.push(request.method);
        return HttpResponse.json({ data: {} });
      }),
    );
    const { user } = await renderRouted(<TagPage tag="go" />, { path: "/tag/go" });
    await user.click(await screen.findByRole("button", { name: "Add to feed" }));
    await user.click(await screen.findByRole("button", { name: "In your feed" }));
    await waitFor(() => expect(methods).toEqual(["POST", "DELETE"]));
    tokens.set(null);
  });
});

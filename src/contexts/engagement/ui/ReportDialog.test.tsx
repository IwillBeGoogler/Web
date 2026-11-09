import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { describe, expect, it, vi } from "vitest";
import { signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { ReportDialog } from "./ReportDialog";

describe("ReportDialog", () => {
  it("is closed without a target", async () => {
    await renderRouted(<ReportDialog target={null} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("requires a note for 'other', then submits and closes", async () => {
    signIn();
    const onClose = vi.fn();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(api("/reports"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const { user } = await renderRouted(<ReportDialog target={{ type: "comment", id: 4 }} onClose={onClose} />);
    expect(screen.getByText("Report response")).toBeInTheDocument();
    await user.click(screen.getByLabelText(/Something else/));
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByText("Tell us what's wrong")).toBeInTheDocument();
    await user.type(screen.getByLabelText("What's wrong?"), "bad");
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(body).toMatchObject({ target_type: "comment", target_id: 4, reason: "other", note: "bad" });
  });

  it("resets and closes via the close button; shows server errors", async () => {
    signIn();
    const onClose = vi.fn();
    server.use(http.post(api("/reports"), () => HttpResponse.json({ error: { message: "boom" } }, { status: 500 })));
    const { user } = await renderRouted(<ReportDialog target={{ type: "diagram", fileId: "f" }} onClose={onClose} />);
    await user.click(screen.getByRole("button", { name: "Submit report" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});

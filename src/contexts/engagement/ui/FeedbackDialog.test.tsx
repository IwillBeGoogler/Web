import { act, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { tokens } from "@/shared/api";
import { signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { feedbackDialog } from "../application/feedbackDialog";
import { FeedbackDialog } from "./FeedbackDialog";

const config = () => http.get(api("/config"), () => HttpResponse.json({ data: { captcha_site_key: "", analytics: false, sso: {} } }));

describe("FeedbackDialog", () => {
  beforeEach(() => {
    server.use(config());
    window.history.replaceState(null, "", "/d/f/abc?share=secret#frag");
  });
  afterEach(() => {
    act(() => feedbackDialog.close());
    tokens.set(null);
    window.history.replaceState(null, "", "/");
  });

  it("sends the message with the page address and browser info, minus query and hash", async () => {
    let body: Record<string, unknown> = {};
    server.use(
      http.post(api("/feedback"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { id: 1 } }, { status: 201 });
      }),
    );
    const { user } = await renderRouted(<FeedbackDialog />);
    act(() => feedbackDialog.open());
    await user.click(await screen.findByRole("radio", { name: "Idea" }));
    await user.type(screen.getByLabelText("Message"), "  add dark mode ");
    await user.type(screen.getByLabelText("Email (optional)"), "me@example.com");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(feedbackDialog.get()).toBeNull());
    expect(body).toEqual({
      kind: "idea",
      message: "add dark mode",
      contact_email: "me@example.com",
      page_url: `${window.location.origin}/d/f/abc`,
      user_agent: navigator.userAgent,
      website: "",
    });
    expect(await screen.findByText("Thanks, we got it.")).toBeInTheDocument();
  });

  it("guides bug reports with a placeholder", async () => {
    const { user } = await renderRouted(<FeedbackDialog />);
    act(() => feedbackDialog.open({ kind: "bug" }));
    expect(await screen.findByPlaceholderText("What were you doing? What did you expect to happen?")).toBeInTheDocument();
    await user.click(screen.getByRole("radio", { name: "Idea" }));
    expect(screen.getByLabelText("Message")).not.toHaveAttribute("placeholder");
  });

  it("keeps the text when sending fails", async () => {
    server.use(http.post(api("/feedback"), () => HttpResponse.json({ status: 500, detail: "down" }, { status: 500 })));
    const { user } = await renderRouted(<FeedbackDialog />);
    act(() => feedbackDialog.open());
    await user.type(await screen.findByLabelText("Message"), "it broke");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByText("Could not send. Your text is kept, try again.")).toBeInTheDocument();
    expect(feedbackDialog.get()).not.toBeNull();
    expect(screen.getByLabelText("Message")).toHaveValue("it broke");
    // a failing report must not offer to report itself
    expect(screen.queryByRole("button", { name: "Report" })).not.toBeInTheDocument();
  });

  it("validates, and attaches the caught error as a bug", async () => {
    signIn();
    let body: Record<string, unknown> = {};
    server.use(
      http.post(api("/feedback"), async ({ request }) => {
        body = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: { id: 1 } }, { status: 201 });
      }),
    );
    const { user } = await renderRouted(<FeedbackDialog />);
    act(() => feedbackDialog.open({ kind: "bug", error: { message: "boom", stack: "Error: boom\n at x" } }));
    expect(screen.queryByLabelText("Email (optional)")).not.toBeInTheDocument(); // signed in
    await user.click(await screen.findByRole("button", { name: "Send" }));
    expect(await screen.findByText("Write a message")).toBeInTheDocument();
    await user.type(screen.getByLabelText("Message"), "crashed");
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(body).toMatchObject({ kind: "bug", error_message: "boom", error_stack: "Error: boom\n at x" }));
    expect(body).not.toHaveProperty("contact_email");
  });
});

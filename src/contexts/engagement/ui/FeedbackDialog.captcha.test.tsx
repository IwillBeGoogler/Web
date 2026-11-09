import { act, screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { feedbackDialog } from "../application/feedbackDialog";

let emit: (t: string) => void = () => {};
let mounts = 0;
vi.mock("@/shared/ui/turnstile", async () => {
  const { useEffect } = await import("react");
  return {
    Turnstile: ({ onToken }: { onToken: (t: string) => void }) => {
      useEffect(() => {
        mounts++;
        emit = onToken;
      }, [onToken]);
      return <div data-testid="ts" />;
    },
  };
});
const { FeedbackDialog } = await import("./FeedbackDialog");

afterEach(() => {
  act(() => feedbackDialog.close());
  tokens.set(null);
});

describe("FeedbackDialog captcha", () => {
  it("requires a token, sends it, refreshes widget on failure, and closes via X", async () => {
    server.use(http.get(api("/config"), () => HttpResponse.json({ data: { captcha_site_key: "sk", analytics: false, sso: {} } })));
    let fail = true;
    const bodies: Record<string, unknown>[] = [];
    server.use(
      http.post(api("/feedback"), async ({ request }) => {
        bodies.push((await request.json()) as Record<string, unknown>);
        return fail ? HttpResponse.json({ detail: "x" }, { status: 500 }) : HttpResponse.json({ data: { id: 1 } }, { status: 201 });
      }),
    );
    const { user } = await renderRouted(<FeedbackDialog />);
    act(() => feedbackDialog.open());
    await screen.findByTestId("ts");
    await user.type(screen.getByLabelText("Message"), "hello");
    await user.click(screen.getByRole("button", { name: "Send" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    act(() => emit(""));
    expect(screen.getByRole("alert")).toBeInTheDocument();
    act(() => emit("tok"));
    expect(screen.queryByRole("alert")).toBeNull();
    const before = mounts;
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(bodies[0]).toMatchObject({ captcha_token: "tok" }));
    await waitFor(() => expect(mounts).toBeGreaterThan(before));
    fail = false;
    act(() => emit("tok2"));
    await user.click(screen.getByRole("button", { name: "Send" }));
    await waitFor(() => expect(feedbackDialog.get()).toBeNull());
    act(() => feedbackDialog.open());
    await user.click(await screen.findByRole("button", { name: "Close" }));
    expect(feedbackDialog.get()).toBeNull();
  });
});

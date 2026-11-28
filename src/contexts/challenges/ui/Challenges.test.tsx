import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it } from "vitest";
import { tokens } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { CertificatePage } from "./CertificatePage";
import { ChallengeForm } from "./ChallengeForm";
import { ChallengePage } from "./ChallengePage";

const challenge = { id: 1, user_id: 99, author: "a", title: "Go", days: 7, visibility: "public", timezone: "UTC", start_date: "2026-02-27" };

describe("challenges ui", () => {
  afterEach(() => tokens.set(null));

  it("shows a heatmap with linked done days and no owner actions to others", async () => {
    i18n.set("en");
    server.use(
      http.get(api("/challenges/1"), () =>
        HttpResponse.json({
          data: {
            ...challenge,
            stats: { days_done: 1, current_streak: 1, best_streak: 1, today: 3, ended: false, end_date: "2026-03-05" },
            entries: [{ date: "2026-02-28", n: 2, post_id: 4, title: "Maps", slug: "maps", author: "a" }],
          },
        }),
      ),
    );
    await renderRouted(<ChallengePage id={1} />);
    expect(await screen.findByRole("link", { name: "Day 2, 2026-02-28: Maps" })).toHaveAttribute("href", "/@a/maps");
    expect(screen.getByRole("img", { name: "Day 1, 2026-02-27: missed" })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Day 3, 2026-03-01: today" })).toBeInTheDocument();
    expect(screen.getByText("Day 2/7")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
  });

  it("validates a custom length and sends the time zone", async () => {
    i18n.set("en");
    signIn();
    let sent: Record<string, unknown> | undefined;
    server.use(
      http.post(api("/challenges"), async ({ request }) => {
        sent = (await request.json()) as Record<string, unknown>;
        return HttpResponse.json({ data: challenge }, { status: 201 });
      }),
    );
    const { user } = await renderRouted(<ChallengeForm onDone={() => {}} />);
    await user.type(screen.getByLabelText("Title"), "Go");
    await user.click(screen.getByRole("button", { name: "Custom" }));
    const days = screen.getByLabelText("Number of days");
    await user.clear(days);
    await user.type(days, "3");
    await user.click(screen.getByRole("button", { name: "Start challenge" }));
    expect(await screen.findByText("Choose 7 to 365 days")).toBeInTheDocument();
    await user.clear(days);
    await user.type(days, "14");
    await user.click(screen.getByRole("button", { name: "Start challenge" }));
    await waitFor(() => expect(sent).toMatchObject({ title: "Go", days: 14, visibility: "public" }));
    expect(sent?.timezone).toBeTruthy();
  });

  it("lets another reader follow and cheer once", async () => {
    i18n.set("en");
    signIn();
    let cheered = false;
    server.use(
      http.get(api("/challenges/1"), () =>
        HttpResponse.json({
          data: {
            ...challenge,
            cheers_today: cheered ? 3 : 2,
            cheered_today: cheered,
            stats: { days_done: 0, current_streak: 0, best_streak: 0, today: 3, ended: false, end_date: "2026-03-05" },
          },
        }),
      ),
      http.post(api("/challenges/1/cheer"), () => {
        cheered = true;
        return HttpResponse.json({ data: { cheers_today: 3, cheered: true } });
      }),
    );
    const { user } = await renderRouted(<ChallengePage id={1} />);
    expect(await screen.findByRole("button", { name: "Follow" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Cheer" }));
    expect(await screen.findByRole("button", { name: "Cheered" })).toBeDisabled();
    expect(screen.getByText(/Cheers today: 3/)).toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });

  it("offers the certificate to an eligible owner and shows the server's refusal", async () => {
    i18n.set("en");
    signIn();
    server.use(
      http.get(api("/me"), () => HttpResponse.json({ data: { ...me, id: 99 } })),
      http.get(api("/challenges/1"), () =>
        HttpResponse.json({
          data: { ...challenge, days: 30, stats: { days_done: 27, current_streak: 0, best_streak: 9, today: 0, ended: true, end_date: "2026-03-28" } },
        }),
      ),
      http.post(api("/challenges/1/certificate"), () => HttpResponse.json({ status: 400, detail: "at least 90% of the days must be done" }, { status: 400 })),
    );
    const { user } = await renderRouted(<ChallengePage id={1} />);
    await user.click(await screen.findByRole("button", { name: "Claim certificate" }));
    expect(await screen.findByText("at least 90% of the days must be done")).toBeInTheDocument();
  });

  it("verifies a certificate and hides downloads once revoked", async () => {
    i18n.set("en");
    const cert = {
      id: "abcdefghijklmnop",
      holder_name: "Ali",
      username: "ali",
      title: "Go",
      days: 30,
      days_done: 28,
      best_streak: 12,
      start_date: "2026-02-27",
      end_date: "2026-03-28",
      issued_at: "2026-03-29T00:00:00Z",
    };
    server.use(
      http.get(api("/certificates/abcdefghijklmnop"), () => HttpResponse.json({ data: cert })),
      http.get(api("/certificates/qrstuvwxyz234567"), () =>
        HttpResponse.json({ data: { ...cert, id: "qrstuvwxyz234567", revoked_at: "2026-04-01T00:00:00Z", revoke_reason: "copied" } }),
      ),
    );
    const first = await renderRouted(<CertificatePage id="abcdefghijklmnop" logo={<span>logo</span>} />);
    expect(await screen.findByRole("heading", { name: "Verified certificate" })).toBeInTheDocument();
    expect(screen.getByText("28/30 days · best streak 12")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "PDF" })).toBeInTheDocument();
    first.unmount();
    await renderRouted(<CertificatePage id="qrstuvwxyz234567" logo={<span>logo</span>} />);
    expect(await screen.findByRole("heading", { name: "Revoked certificate" })).toBeInTheDocument();
    expect(screen.getByText("copied")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "PDF" })).not.toBeInTheDocument();
  });
});

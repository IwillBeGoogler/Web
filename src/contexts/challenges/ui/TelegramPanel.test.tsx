import { screen, waitFor } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { tokens } from "@/shared/api";
import { i18n } from "@/shared/i18n";
import { signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { TelegramPanel } from "./TelegramPanel";

describe("telegram panel", () => {
  afterEach(() => {
    tokens.set(null);
    vi.restoreAllMocks();
  });

  it("opens the bot link, refreshes on focus and disconnects", async () => {
    i18n.set("en");
    signIn();
    let linked = false;
    server.use(
      http.get(api("/me/telegram"), () => HttpResponse.json({ data: { enabled: true, linked, linked_at: null } })),
      http.post(api("/me/telegram/link"), () => HttpResponse.json({ data: { url: "https://t.me/testbot?start=abc" } })),
      http.delete(api("/me/telegram"), () => {
        linked = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const replace = vi.fn();
    vi.spyOn(window, "open").mockReturnValue({ location: { replace }, close: vi.fn() } as unknown as Window);
    const { user } = await renderRouted(<TelegramPanel />);
    await user.click(await screen.findByRole("button", { name: "Connect Telegram" }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith("https://t.me/testbot?start=abc"));
    expect(screen.getByRole("link", { name: "Open Telegram" })).toHaveAttribute("href", "https://t.me/testbot?start=abc");
    linked = true;
    window.dispatchEvent(new Event("visibilitychange"));
    await user.click(await screen.findByRole("button", { name: "Disconnect Telegram" }));
    expect(await screen.findByRole("button", { name: "Connect Telegram" })).toBeInTheDocument();
  });

  it("renders nothing while the bot is off", async () => {
    signIn();
    let asked = false;
    server.use(
      http.get(api("/me/telegram"), () => {
        asked = true;
        return HttpResponse.json({ data: { enabled: false, linked: false, linked_at: null } });
      }),
    );
    await renderRouted(<TelegramPanel />);
    await waitFor(() => expect(asked).toBe(true));
    expect(screen.queryByRole("heading", { name: "Telegram" })).not.toBeInTheDocument();
  });
});

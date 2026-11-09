import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { feedbackDialog } from "@/contexts/engagement/application/feedbackDialog";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { readingPrefs } from "@/contexts/preferences/application/store";
import { tokens } from "@/shared/api";
import { me, signIn } from "@/test/fixtures";
import { renderRouted } from "@/test/render";
import { api, server } from "@/test/server";
import { TopBar } from "./TopBar";

const nav = (platform: string, ua: string) => {
  Object.defineProperty(navigator, "platform", { value: platform, configurable: true });
  Object.defineProperty(navigator, "userAgent", { value: ua, configurable: true });
};
const origUA = navigator.userAgent;
const origPlatform = navigator.platform;

afterEach(() => {
  nav(origPlatform, origUA);
  tokens.set(null);
  authDialog.close();
  feedbackDialog.close();
  vi.unstubAllGlobals();
  document.documentElement.classList.remove("dark");
});

const notifs = (unread: number) => http.get(api("/me/notifications"), () => HttpResponse.json({ data: [], meta: { unread, page: 1, limit: 20, total: 0, has_more: false } }));

describe("TopBar signed out", () => {
  it("shows auth buttons, feedback, theme toggle", async () => {
    document.documentElement.classList.remove("dark");
    const { user } = await renderRouted(<TopBar />);
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(authDialog.get()).toBe("signin");
    await user.click(screen.getByRole("button", { name: "Join free" }));
    expect(authDialog.get()).toBe("signup");
    await user.click(screen.getByRole("button", { name: "Send feedback" }));
    expect(feedbackDialog.get()).not.toBeNull();
    expect(screen.queryByRole("link", { name: "Saved" })).toBeNull();
    const set = vi.spyOn(readingPrefs, "set");
    await user.click(screen.getByRole("button", { name: "Switch light or dark" }));
    expect(set).toHaveBeenCalledWith({ palette: "galaxy" });
    document.documentElement.classList.add("dark");
    await waitFor(() => expect(document.documentElement.classList.contains("dark")).toBe(true));
    await user.click(screen.getByRole("button", { name: "Switch light or dark" }));
    expect(set).toHaveBeenLastCalledWith({ palette: "daylight" });
    set.mockRestore();
  });

  it("scroll toggles shadow", async () => {
    const { container } = await renderRouted(<TopBar />);
    const header = container.querySelector("header");
    expect(header?.className).not.toContain("shadow-[0_2px");
    Object.defineProperty(window, "scrollY", { value: 50, configurable: true });
    act(() => {
      dispatchEvent(new Event("scroll"));
    });
    expect(header?.className).toContain("shadow-[0_2px");
    Object.defineProperty(window, "scrollY", { value: 0, configurable: true });
  });
});

describe("search box", () => {
  it("submit navigates, blank does not, escape clears, shortcuts focus", async () => {
    nav("Linux", "x");
    const { user, router } = await renderRouted(<TopBar />);
    const find = () => screen.getAllByLabelText("Search").find((e) => e.tagName === "INPUT") as HTMLInputElement;
    let input = find();
    expect(await screen.findByText("Ctrl K")).toBeInTheDocument();
    await user.type(input, "   {Enter}");
    expect(router.state.location.pathname).toBe("/");
    await user.type(input, "rust{Enter}");
    await waitFor(() => expect(router.state.location.pathname).toBe("/search"));
    expect(router.state.location.search).toEqual({ q: "rust" });
    // route change remounts the bar
    input = find();
    await user.type(input, "abc");
    await user.type(input, "{Escape}");
    expect(input).toHaveValue("");
    expect(input).not.toHaveFocus();
    fireEvent.keyDown(document.body, { key: "k", ctrlKey: true });
    expect(input).toHaveFocus();
    input.blur();
    fireEvent.keyDown(document.body, { key: "/" });
    expect(input).toHaveFocus();
    // slash inside input / other key / contenteditable are ignored
    const ev = fireEvent.keyDown(input, { key: "/" });
    expect(ev).toBe(true);
    input.blur();
    fireEvent.keyDown(document.body, { key: "a" });
    expect(input).not.toHaveFocus();
    const ce = document.createElement("div");
    Object.defineProperty(ce, "isContentEditable", { value: true });
    document.body.append(ce);
    fireEvent.keyDown(ce, { key: "/" });
    expect(input).not.toHaveFocus();
    ce.remove();
  });

  it("shows mac key hint", async () => {
    nav("MacIntel", "x");
    await renderRouted(<TopBar />);
    expect(await screen.findByText("⌘K")).toBeInTheDocument();
  });

  it("mac hint falls back to userAgent", async () => {
    nav("", "iPhone");
    await renderRouted(<TopBar />);
    expect(await screen.findByText("⌘K")).toBeInTheDocument();
  });
});

describe("TopBar signed in", () => {
  it("shows nav links, bell with unread count, rings on increase", async () => {
    signIn();
    let unread = 2;
    server.use(http.get(api("/me/notifications"), () => HttpResponse.json({ data: [], meta: { unread, page: 1, limit: 20, total: 0, has_more: false } })));
    const { qc } = await renderRouted(<TopBar />);
    expect(await screen.findByRole("link", { name: "Notifications, 2 unread" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Saved" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "New draft" })).toHaveAttribute("href", "/new-story");
    unread = 12;
    await act(async () => {
      await qc.invalidateQueries({ queryKey: ["notifications"] });
    });
    const bell = await screen.findByRole("link", { name: "Notifications, 12 unread" });
    expect(bell).toHaveTextContent("9+");
    expect(bell.querySelector("svg")?.getAttribute("class")).toContain("animate-wiggle");
  });

  it("bell without unread", async () => {
    signIn();
    server.use(notifs(0));
    await renderRouted(<TopBar />);
    expect(await screen.findByRole("link", { name: "Notifications" })).toBeInTheDocument();
  });

  it("account menu navigates, toggles theme, feedback, sign out", async () => {
    signIn();
    server.use(notifs(0), http.post(api("/auth/logout"), () => HttpResponse.json({ data: {} })));
    const { user, router } = await renderRouted(<TopBar />);
    const open = async () => user.click(await screen.findByRole("button", { name: "Account menu" }));
    const dests: [string, string][] = [
      ["Profile", `/@${me.username}`],
      ["Saved", "/me/library"],
      ["Your writing", "/me/stories"],
      ["Insights", "/me/stats"],
      ["Publications", "/me/publications"],
      ["Settings", "/me/settings"],
    ];
    for (const [name, path] of dests) {
      await open();
      const menu = await screen.findByRole("menu");
      expect(within(menu).getByText(`@${me.username}`)).toBeInTheDocument();
      await user.click(within(menu).getByRole("menuitem", { name: new RegExp(`^${name}`) }));
      await waitFor(() => expect(router.state.location.pathname).toBe(path));
    }
    document.documentElement.classList.remove("dark");
    const set = vi.spyOn(readingPrefs, "set");
    await open();
    await user.click(await screen.findByRole("menuitem", { name: "Dark mode" }));
    expect(set).toHaveBeenCalledWith({ palette: "galaxy" });
    document.documentElement.classList.add("dark");
    await open();
    await user.click(await screen.findByRole("menuitem", { name: "Light mode" }));
    expect(set).toHaveBeenLastCalledWith({ palette: "daylight" });
    set.mockRestore();
    await open();
    await user.click(await screen.findByRole("menuitem", { name: "Send feedback" }));
    expect(feedbackDialog.get()).not.toBeNull();
    await open();
    await user.click(await screen.findByRole("menuitem", { name: "Sign out" }));
    await waitFor(() => expect(tokens.get()).toBeNull());
  });
});

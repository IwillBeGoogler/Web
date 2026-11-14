import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { feedbackDialog } from "@/contexts/engagement/application/feedbackDialog";
import { adopted } from "@/contexts/publishing/application/adopted";
import { tokens } from "@/shared/api";

const h = vi.hoisted(() => ({ boom: false, mounts: 0, track: vi.fn(), report: vi.fn() }));

const show = (name: string) => (p: object) => <div data-testid={name}>{JSON.stringify(p)}</div>;
vi.mock("./pages/HomePage", () => ({
  HomePage: (p: object) => {
    if (h.boom) throw new Error("boom");
    return show("home")(p);
  },
}));
vi.mock("./pages/ArticlePage", () => ({ ArticlePage: show("article") }));
vi.mock("./pages/ProfilePage", () => ({ ProfilePage: show("profile") }));
vi.mock("./pages/TagPage", () => ({ TagPage: show("tag") }));
vi.mock("./pages/SearchPage", () => ({ SearchPage: show("search") }));
vi.mock("./pages/EditorPage", () => ({
  EditorPage: (p: object) => {
    // biome-ignore lint/correctness/useHookAtTopLevel: test mock counts mounts
    const { useEffect } = require("react");
    useEffect(() => {
      h.mounts++;
    }, []);
    return show("editor")(p);
  },
}));
vi.mock("./pages/MePages", () => ({
  LibraryPage: show("library"),
  StoriesPage: show("stories"),
  NotificationsPage: show("notifications"),
  PublicationsPage: show("publications"),
  SettingsPage: (p: { tab: string; onTab: (t: "security") => void }) => (
    <button type="button" data-testid="settings" onClick={() => p.onTab("security")}>
      {p.tab}
    </button>
  ),
  StatsRoute: show("stats"),
  ListRoute: show("list"),
  SeriesRoute: show("series"),
  PublicationRoute: show("pubroute"),
}));
vi.mock("./pages/LegalPages", () => ({ PrivacyPage: show("privacy"), TermsPage: show("terms") }));
vi.mock("./pages/DiagramPages", () => ({
  DiagramsPage: show("diagrams"),
  DiagramProjectPage: show("dproject"),
  DiagramFilePage: show("dfile"),
  DiagramSharePage: show("dshare"),
  DiagramViewPage: show("dview"),
  TemplatesPage: show("templates"),
}));
vi.mock("@/contexts/identity/ui/SsoCallback", () => ({ SsoCallbackPage: show("sso") }));
vi.mock("@/contexts/account/ui/AuthPages", () => ({
  ForgotPasswordPage: show("forgot"),
  ResetPasswordPage: show("reset"),
  VerifyEmailPage: show("verify"),
  UnsubscribePage: show("unsub"),
}));
vi.mock("./layout/TopBar", () => ({ TopBar: () => <header>topbar</header> }));
vi.mock("./layout/Footer", () => ({ Footer: () => <footer>footer</footer> }));
vi.mock("./layout/CookieBanner", () => ({ CookieBanner: () => null }));
vi.mock("@/contexts/preferences/ui/ReadingPanel", () => ({ ReadingDock: () => <div data-testid="dock" /> }));
vi.mock("@/contexts/identity/ui/AuthDialog", () => ({ AuthDialog: () => null }));
vi.mock("@/contexts/engagement/ui/FeedbackDialog", () => ({ FeedbackDialog: () => null }));
vi.mock("@/contexts/engagement/application/realtime", () => ({ useLiveNotifications: vi.fn() }));
vi.mock("@/shared/ui/galaxy", () => ({ Galaxy: (p: { planet: boolean }) => <div data-testid="galaxy">{String(p.planet)}</div> }));
vi.mock("@/shared/ui/EarthHorizon", () => ({ default: (p: { satellite: boolean }) => <div data-testid="earth">{String(p.satellite)}</div> }));
vi.mock("@/shared/analytics", () => ({ track: h.track }));
vi.mock("@/shared/errorReporting", () => ({ reportError: h.report }));

import { queryClient, router } from "./router";

const go = async (to: string) => {
  await act(async () => {
    await router.navigate({ to } as never);
  });
};
const path = () => router.state.location.pathname;

beforeEach(async () => {
  tokens.set({ token: "t", expiresAt: "2030-01-01T00:00:00Z" });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  await go("/");
});
afterEach(() => {
  tokens.set(null);
  h.boom = false;
  adopted.id = null;
  feedbackDialog.close();
});

describe("router", () => {
  it("home: shell, search validation, tracking", async () => {
    expect(await screen.findByTestId("home")).toHaveTextContent("{}");
    expect(screen.getByText("topbar")).toBeInTheDocument();
    expect(screen.getByText("footer")).toBeInTheDocument();
    // the Earth waits for the first interaction (or idle time after load)
    expect(screen.queryByTestId("earth")).toBeNull();
    dispatchEvent(new Event("pointermove"));
    expect(await screen.findByTestId("earth")).toHaveTextContent("true");
    expect(screen.getByTestId("galaxy")).toHaveTextContent("true");
    expect(screen.getByTestId("dock")).toBeInTheDocument();
    await act(async () => {
      await router.navigate({ to: "/", search: { tab: "following" } });
    });
    expect(await screen.findByText(/following/)).toBeInTheDocument();
    await act(async () => {
      await router.navigate({ to: "/", search: { tab: "bogus" } as never });
    });
    expect(screen.getByTestId("home")).toHaveTextContent("{}");
    expect(h.track).toHaveBeenCalledWith({ name: "page_view", path: "/" });
  });

  it("public param routes", async () => {
    const cases: [string, string, string][] = [
      ["/@ali/hello", "article", '"slug":"hello"'],
      ["/p/abc", "article", '"slug":"abc"'],
      ["/@ali", "profile", '"username":"ali"'],
      ["/tag/go", "tag", '"tag":"go"'],
      ["/lists/l1", "list", '"slug":"l1"'],
      ["/series/s1", "series", '"slug":"s1"'],
      ["/pub/p1", "pubroute", '"slug":"p1"'],
      ["/privacy", "privacy", ""],
      ["/terms", "terms", ""],
      ["/auth/callback", "sso", ""],
      ["/forgot-password", "forgot", ""],
      ["/d/v/my-slug", "dview", '"slug":"my-slug"'],
      ["/templates", "templates", ""],
      ["/d/s/tok", "dshare", '"token":"tok"'],
    ];
    for (const [to, id, text] of cases) {
      await go(to);
      await waitFor(() => {
        const el = screen.getByTestId(id);
        if (text) expect(el).toHaveTextContent(text);
      });
    }
  });

  it("search/reset/verify/unsubscribe search params with defaults", async () => {
    await go("/search");
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent('"q":""'));
    await go("/search?q=rust");
    await waitFor(() => expect(screen.getByTestId("search")).toHaveTextContent('"q":"rust"'));
    await go("/reset-password");
    await waitFor(() => expect(screen.getByTestId("reset")).toHaveTextContent('"token":""'));
    await go("/reset-password?token=abc");
    await waitFor(() => expect(screen.getByTestId("reset")).toHaveTextContent('"token":"abc"'));
    await go("/verify-email");
    await waitFor(() => expect(screen.getByTestId("verify")).toHaveTextContent('"code":""'));
    await go("/verify-email?code=c1");
    await waitFor(() => expect(screen.getByTestId("verify")).toHaveTextContent('"code":"c1"'));
    await go("/verify-email?token=t1");
    await waitFor(() => expect(screen.getByTestId("verify")).toHaveTextContent('"code":"t1"'));
    await go("/unsubscribe");
    await waitFor(() => expect(screen.getByTestId("unsub")).toHaveTextContent('"s":"","a":"","sig":""'));
    await go("/unsubscribe?s=x1&a=y2&sig=z3");
    await waitFor(() => expect(screen.getByTestId("unsub")).toHaveTextContent('"s":"x1","a":"y2","sig":"z3"'));
  });

  it("keeps numeric unsubscribe params as strings", async () => {
    await go("/unsubscribe?s=1&a=2&sig=3");
    await waitFor(() => expect(screen.getByTestId("unsub")).toHaveTextContent('"s":"1","a":"2","sig":"3"'));
  });

  it("legacy /posts/$slug redirects to /p/$slug", async () => {
    await go("/posts/old");
    await waitFor(() => expect(path()).toBe("/p/old"));
  });

  it("signed-in routes render", async () => {
    for (const [to, id] of [
      ["/me/library", "library"],
      ["/me/stories", "stories"],
      ["/me/notifications", "notifications"],
      ["/me/publications", "publications"],
      ["/d", "diagrams"],
    ] as const) {
      await go(to);
      expect(await screen.findByTestId(id)).toBeInTheDocument();
    }
    await go("/me/stats?post=7");
    await waitFor(() => expect(screen.getByTestId("stats")).toHaveTextContent('"post":7'));
    await go("/me/stats?post=-1");
    await waitFor(() => expect(screen.getByTestId("stats")).not.toHaveTextContent("post"));
    await go("/d/p/pr1");
    expect(await screen.findByTestId("dproject")).toHaveTextContent('"projectId":"pr1"');
    await go("/d/f/f1");
    expect(await screen.findByTestId("dfile")).toHaveTextContent('"fileId":"f1"');
    await go("/d/f/f1?comment=9");
    await waitFor(() => expect(screen.getByTestId("dfile")).toHaveTextContent('"commentId":"9"'));
    // reading dock hidden on diagram routes, galaxy/earth hidden in the editor
    expect(screen.queryByTestId("dock")).toBeNull();
    expect(screen.queryByTestId("galaxy")).toBeNull();
    expect(screen.queryByText("footer")).toBeNull();
    expect(screen.queryByTestId("earth")).toBeNull();
  });

  it("settings tab default and onTab navigates", async () => {
    await go("/me/settings");
    const btn = await screen.findByTestId("settings");
    expect(btn).toHaveTextContent("profile");
    fireEvent.click(btn);
    await waitFor(() => expect(router.state.location.search).toEqual({ tab: "security" }));
    await go("/me/settings?tab=nope");
    await waitFor(() => expect(screen.getByTestId("settings")).toHaveTextContent("profile"));
  });

  it("reading pages: no planet, no earth", async () => {
    await go("/p/abc");
    await screen.findByTestId("article");
    expect(screen.getByTestId("galaxy")).toHaveTextContent("false");
    expect(screen.queryByTestId("earth")).toBeNull();
    await go("/@ali/edit");
    await waitFor(() => expect(screen.getByTestId("galaxy")).toHaveTextContent("true"));
    expect(await screen.findByTestId("earth")).toBeInTheDocument();
  });

  it("signed out guard redirects home", async () => {
    tokens.set(null);
    await go("/me/library");
    await waitFor(() => expect(path()).toBe("/"));
    await go("/d");
    await waitFor(() => expect(path()).toBe("/"));
  });

  it("editor routes keep the same editor when adopted id matches", async () => {
    await go("/new-story");
    expect(await screen.findByTestId("editor")).toHaveTextContent("{}");
    const mounts = h.mounts;
    adopted.id = 5;
    await go("/p/5/edit");
    await waitFor(() => expect(screen.getByTestId("editor")).toHaveTextContent('"id":5'));
    expect(h.mounts).toBe(mounts);
    adopted.id = null;
    await go("/p/6/edit");
    await waitFor(() => expect(screen.getByTestId("editor")).toHaveTextContent('"id":6'));
    expect(h.mounts).toBe(mounts + 1);
  });

  it("not found page", async () => {
    await go("/nope/nope/nope");
    expect(await screen.findByText("Page not found")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /home/i })).toHaveAttribute("href", "/");
  });

  it("error boundary: reports, retry, send feedback", async () => {
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    await go("/privacy");
    h.boom = true;
    await go("/");
    const retry = await screen.findByRole("button", { name: "Try again" });
    expect(h.report).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Report this problem" }));
    expect(feedbackDialog.get()?.kind).toBe("bug");
    h.boom = false;
    fireEvent.click(retry);
    expect(await screen.findByTestId("home")).toBeInTheDocument();
    err.mockRestore();
  });
});

describe("queryClient retry policy", () => {
  it("never retries client errors, retries network twice", async () => {
    const { ApiError } = await import("@/shared/http");
    const retry = queryClient.getDefaultOptions().queries?.retry as (n: number, e: unknown) => boolean;
    expect(retry(0, new ApiError(404, {} as never))).toBe(false);
    expect(retry(0, new ApiError(500, {} as never))).toBe(true);
    expect(retry(2, new ApiError(500, {} as never))).toBe(false);
    expect(retry(1, new Error("net"))).toBe(true);
  });
});

import { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  createRoute,
  createRouter,
  Outlet,
  redirect,
  useNavigate,
  useParams,
  useRouterState,
  useSearch,
} from "@tanstack/react-router";
import { FileQuestionIcon } from "lucide-react";
import { lazy as reactLazy, Suspense, useEffect, useRef } from "react";
import { Toaster } from "sonner";
import { z } from "zod";
import { feedbackDialog } from "@/contexts/engagement/application/feedbackDialog";
import { useLiveNotifications } from "@/contexts/engagement/application/realtime";
import { errorDetails } from "@/contexts/engagement/domain/feedback";
import { FeedbackDialog } from "@/contexts/engagement/ui/FeedbackDialog";
import { ReadingDock } from "@/contexts/preferences/ui/ReadingPanel";
import { adopted } from "@/contexts/publishing/application/adopted";
import "@/contexts/preferences/application/store";
import { AuthDialog } from "@/contexts/identity/ui/AuthDialog";
import { track } from "@/shared/analytics";
import { tokens } from "@/shared/api";
import { reportError } from "@/shared/errorReporting";
import { explainError, isApiError } from "@/shared/http";
import { useT } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { Galaxy } from "@/shared/ui/galaxy";

const EarthHorizon = reactLazy(() => import("@/shared/ui/EarthHorizon"));

import { EmptyState } from "@/shared/ui/states";
import { CookieBanner } from "./layout/CookieBanner";
import { Footer } from "./layout/Footer";
import { BRAND } from "./layout/Logo";
import { TopBar } from "./layout/TopBar";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // never retry client errors (404, 403…); retry flaky network twice
      retry: (n, e) => !(isApiError(e) && e.status < 500) && n < 2,
    },
  },
});

function Live() {
  useLiveNotifications();
  return null;
}

/** Story pages (/@user/slug, /p/slug, /posts/slug) keep only the starfield: no planet or sun behind the text. */
const isReading = (path: string) => /^\/(@[^/]+|p|posts)\/[^/]+\/?$/.test(path) && !path.endsWith("/edit");

/** The diagram editor fills the window under the top bar: its own calm backdrop (embed/theme.css), no footer. */
const isEditor = (path: string) => /^\/d\/(f|s|v)\/[^/]+\/?$/.test(path);

function Shell() {
  const t = useT();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const editor = isEditor(path);
  return (
    <div className="min-h-dvh text-fg">
      {editor ? null : <Galaxy planet={!isReading(path)} />}
      {isReading(path) || editor ? null : (
        <Suspense fallback={null}>
          <EarthHorizon satellite={path === "/"} brand={BRAND} />
        </Suspense>
      )}
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-50 focus:bg-surface focus:px-4 focus:py-2">
        {t("nav.skip")}
      </a>
      <TopBar />
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
      {editor ? null : <Footer />}
    </div>
  );
}

function NotFound() {
  const t = useT();
  return (
    <EmptyState
      icon={FileQuestionIcon}
      title={t("page.notFound")}
      body={t("page.notFoundBody")}
      action={
        <Button asChild>
          <a href="/">{t("page.backHome")}</a>
        </Button>
      }
    />
  );
}

/** Also mounted on the error screen: a root error unmounts the root component and its toasts. */
function AppToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            "flex w-[min(92vw,380px)] items-center gap-3 rounded-[var(--radius-sm)] border border-line-strong bg-inverse px-3 py-2.5 font-mono text-[12px] text-on-inverse shadow-[3px_3px_0_0_var(--line-strong)] before:rounded-[2px] before:bg-on-inverse/15 before:px-1 before:text-[10px] before:content-['OK']",
          error: "border-danger before:content-['ERR']",
          title: "leading-5",
          icon: "hidden",
        },
      }}
    />
  );
}

function RouteError({ error, reset }: { error: unknown; reset: () => void }) {
  const t = useT();
  const explained = explainError(error, t);
  useEffect(() => reportError(error), [error]);
  return (
    <>
      <EmptyState
        icon={FileQuestionIcon}
        title={t("page.error")}
        body={import.meta.env.DEV ? String(error) : [explained.text, explained.ref && t("err.ref", { id: explained.ref })].filter(Boolean).join(" ")}
        action={
          <>
            <Button variant="outline" onClick={reset}>
              {t("page.tryAgain")}
            </Button>
            <Button
              variant="outline"
              onClick={() => feedbackDialog.open({ kind: "bug", error: { message: explained.detail, stack: errorDetails(error).stack } })}
            >
              {t("feedback.reportProblem")}
            </Button>
          </>
        }
      />
      <FeedbackDialog />
      <AppToaster />
    </>
  );
}

/** The reading dock is for the blog's pages: on the diagram routes (/d, /d/p/*, /d/f/*, /d/s/*) it would float over the editor. */
const onDiagrams = (path: string) => /^\/d(\/|$)/.test(path);
function Dock() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  return onDiagrams(path) ? null : <ReadingDock />;
}

const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  component: () => (
    <>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
      <AuthDialog />
      <FeedbackDialog />
      <Live />
      <Dock />
      <CookieBanner />
      <AppToaster />
    </>
  ),
  notFoundComponent: NotFound,
  errorComponent: RouteError,
});

const shell = createRoute({ getParentRoute: () => root, id: "shell", component: Shell });
const signedIn = ({ location }: { location: { href: string } }) => {
  if (!tokens.get()) throw redirect({ to: "/", search: {}, state: { from: location.href } as never });
};

/** Code-split page component, typed by its export. */
const lazy = <M extends Record<string, unknown>, K extends keyof M & string>(load: () => Promise<M>, name: K) =>
  reactLazy(() => load().then((m) => ({ default: m[name] as React.ComponentType }))) as unknown as M[K];

const page = <P extends object>(C: React.ComponentType<P>, props: () => P) =>
  function Routed() {
    return <C {...props()} />;
  };

const P = {
  Home: lazy(() => import("./pages/HomePage"), "HomePage"),
  Article: lazy(() => import("./pages/ArticlePage"), "ArticlePage"),
  Profile: lazy(() => import("./pages/ProfilePage"), "ProfilePage"),
  Tag: lazy(() => import("./pages/TagPage"), "TagPage"),
  Search: lazy(() => import("./pages/SearchPage"), "SearchPage"),
  Editor: lazy(() => import("./pages/EditorPage"), "EditorPage"),
  Settings: lazy(() => import("./pages/MePages"), "SettingsPage"),
  Stats: lazy(() => import("./pages/MePages"), "StatsRoute"),
  List: lazy(() => import("./pages/MePages"), "ListRoute"),
  Series: lazy(() => import("./pages/MePages"), "SeriesRoute"),
  Publication: lazy(() => import("./pages/MePages"), "PublicationRoute"),
  SsoCallback: lazy(() => import("@/contexts/identity/ui/SsoCallback"), "SsoCallbackPage"),
  Forgot: lazy(() => import("@/contexts/account/ui/AuthPages"), "ForgotPasswordPage"),
  Reset: lazy(() => import("@/contexts/account/ui/AuthPages"), "ResetPasswordPage"),
  Verify: lazy(() => import("@/contexts/account/ui/AuthPages"), "VerifyEmailPage"),
  Unsubscribe: lazy(() => import("@/contexts/account/ui/AuthPages"), "UnsubscribePage"),
  Privacy: lazy(() => import("./pages/LegalPages"), "PrivacyPage"),
  Terms: lazy(() => import("./pages/LegalPages"), "TermsPage"),
  Diagrams: lazy(() => import("./pages/DiagramPages"), "DiagramsPage"),
  DiagramProject: lazy(() => import("./pages/DiagramPages"), "DiagramProjectPage"),
  DiagramFile: lazy(() => import("./pages/DiagramPages"), "DiagramFilePage"),
  DiagramShare: lazy(() => import("./pages/DiagramPages"), "DiagramSharePage"),
  DiagramView: lazy(() => import("./pages/DiagramPages"), "DiagramViewPage"),
  Templates: lazy(() => import("./pages/DiagramPages"), "TemplatesPage"),
};
const meLazy = (name: "LibraryPage" | "StoriesPage" | "NotificationsPage" | "PublicationsPage") => lazy(() => import("./pages/MePages"), name);

const s = <T extends z.ZodRawShape>(shape: T) => z.object(shape);
const str = z.union([z.string(), z.number()]).transform(String).optional().catch(undefined);

const home = createRoute({
  getParentRoute: () => shell,
  path: "/",
  validateSearch: s({ tab: z.enum(["for-you", "following", "latest"]).optional().catch(undefined) }),
  component: page(P.Home, () => ({ tab: useSearch({ from: "/shell/" }).tab })),
});
const article = createRoute({
  getParentRoute: () => shell,
  path: "/@{$username}/$slug",
  component: page(P.Article, () => ({ slug: useParams({ from: "/shell/@{$username}/$slug" }).slug })),
});
const articleAnon = createRoute({
  getParentRoute: () => shell,
  path: "/p/$slug",
  component: page(P.Article, () => ({ slug: useParams({ from: "/shell/p/$slug" }).slug })),
});
const profile = createRoute({
  getParentRoute: () => shell,
  path: "/@{$username}",
  component: page(P.Profile, () => ({ username: useParams({ from: "/shell/@{$username}" }).username })),
});
const tag = createRoute({
  getParentRoute: () => shell,
  path: "/tag/$tag",
  component: page(P.Tag, () => ({ tag: useParams({ from: "/shell/tag/$tag" }).tag })),
});
const search = createRoute({
  getParentRoute: () => shell,
  path: "/search",
  validateSearch: s({ q: str }),
  component: page(P.Search, () => ({ q: useSearch({ from: "/shell/search" }).q ?? "" })),
});
const list = createRoute({
  getParentRoute: () => shell,
  path: "/lists/$slug",
  component: page(P.List, () => ({ slug: useParams({ from: "/shell/lists/$slug" }).slug })),
});
const series = createRoute({
  getParentRoute: () => shell,
  path: "/series/$slug",
  component: page(P.Series, () => ({ slug: useParams({ from: "/shell/series/$slug" }).slug })),
});
const pub = createRoute({
  getParentRoute: () => shell,
  path: "/pub/$slug",
  component: page(P.Publication, () => ({ slug: useParams({ from: "/shell/pub/$slug" }).slug })),
});

const privacy = createRoute({ getParentRoute: () => shell, path: "/privacy", component: P.Privacy });
const terms = createRoute({ getParentRoute: () => shell, path: "/terms", component: P.Terms });
// Links in emails sent before stories moved to /p/$slug.
const legacyPost = createRoute({
  getParentRoute: () => shell,
  path: "/posts/$slug",
  beforeLoad: ({ params }) => {
    throw redirect({ to: "/p/$slug", params: { slug: params.slug }, replace: true });
  },
});
const ssoCallback = createRoute({ getParentRoute: () => shell, path: "/auth/callback", component: P.SsoCallback });
const forgot = createRoute({ getParentRoute: () => shell, path: "/forgot-password", component: P.Forgot });
const reset = createRoute({
  getParentRoute: () => shell,
  path: "/reset-password",
  validateSearch: s({ token: str }),
  component: page(P.Reset, () => ({ token: useSearch({ from: "/shell/reset-password" }).token ?? "" })),
});
const verify = createRoute({
  getParentRoute: () => shell,
  path: "/verify-email",
  validateSearch: s({ code: str, token: str }),
  component: page(P.Verify, () => {
    const q = useSearch({ from: "/shell/verify-email" });
    return { code: q.code ?? q.token ?? "" };
  }),
});
const unsubscribe = createRoute({
  getParentRoute: () => shell,
  path: "/unsubscribe",
  validateSearch: s({ s: str, a: str, sig: str }),
  component: page(P.Unsubscribe, () => {
    const q = useSearch({ from: "/shell/unsubscribe" });
    return { s: q.s ?? "", a: q.a ?? "", sig: q.sig ?? "" };
  }),
});

const library = createRoute({ getParentRoute: () => shell, path: "/me/library", beforeLoad: signedIn, component: meLazy("LibraryPage") });
const stories = createRoute({ getParentRoute: () => shell, path: "/me/stories", beforeLoad: signedIn, component: meLazy("StoriesPage") });
const notifications = createRoute({ getParentRoute: () => shell, path: "/me/notifications", beforeLoad: signedIn, component: meLazy("NotificationsPage") });
const publications = createRoute({ getParentRoute: () => shell, path: "/me/publications", beforeLoad: signedIn, component: meLazy("PublicationsPage") });
const stats = createRoute({
  getParentRoute: () => shell,
  path: "/me/stats",
  beforeLoad: signedIn,
  validateSearch: s({ post: z.coerce.number().int().positive().optional().catch(undefined) }),
  component: page(P.Stats, () => ({ post: useSearch({ from: "/shell/me/stats" }).post })),
});
const settingsTabs = ["profile", "reading", "security", "privacy", "account"] as const;
const settings = createRoute({
  getParentRoute: () => shell,
  path: "/me/settings",
  beforeLoad: signedIn,
  validateSearch: s({ tab: z.enum(settingsTabs).optional().catch(undefined) }),
  component: page(P.Settings, () => {
    const nav = useNavigate();
    return {
      tab: useSearch({ from: "/shell/me/settings" }).tab ?? "profile",
      onTab: (t: (typeof settingsTabs)[number]) => void nav({ to: "/me/settings", search: { tab: t }, replace: true }),
    };
  }),
});

// Diagram editor (the sibling Client app, embedded): dashboard, project tree, editor, share link.
const diagrams = createRoute({ getParentRoute: () => shell, path: "/d", beforeLoad: signedIn, component: P.Diagrams });
const diagramProject = createRoute({
  getParentRoute: () => shell,
  path: "/d/p/$projectId",
  beforeLoad: signedIn,
  component: page(P.DiagramProject, () => ({ projectId: useParams({ from: "/shell/d/p/$projectId" }).projectId })),
});
const diagramFile = createRoute({
  getParentRoute: () => shell,
  path: "/d/f/$fileId",
  // a notification link: open this comment thread. The router JSON-decodes search values, so `?comment=9` arrives as the number 9.
  validateSearch: s({ comment: z.union([z.string(), z.number()]).transform(String).optional().catch(undefined) }),
  component: page(P.DiagramFile, () => ({
    fileId: useParams({ from: "/shell/d/f/$fileId" }).fileId,
    commentId: useSearch({ from: "/shell/d/f/$fileId" }).comment,
  })),
});
const diagramShare = createRoute({
  getParentRoute: () => shell,
  path: "/d/s/$token",
  component: page(P.DiagramShare, () => ({ token: useParams({ from: "/shell/d/s/$token" }).token })),
});

// A published diagram and the template gallery: both open to anyone.
const diagramView = createRoute({
  getParentRoute: () => shell,
  path: "/d/v/$slug",
  component: page(P.DiagramView, () => ({ slug: useParams({ from: "/shell/d/v/$slug" }).slug })),
});
const templates = createRoute({ getParentRoute: () => shell, path: "/templates", component: P.Templates });

/**
 * One editor for /new-story and /p/$id/edit: a pathless layout route renders it and the two paths are childless children,
 * so a new story that gets its first save moves to /p/$id/edit (replace) without remounting the editor and losing the caret.
 */
function EditorRoute() {
  const params = useParams({ strict: false }) as { id?: string };
  const id = params.id ? Number(params.id) : undefined;
  const keyRef = useRef<string>(String(id ?? "new"));
  if (!(id !== undefined && id === adopted.id)) keyRef.current = String(id ?? "new");
  return <P.Editor key={keyRef.current} {...(id !== undefined ? { id } : {})} />;
}
const editorShell = createRoute({ getParentRoute: () => root, id: "editor", component: EditorRoute });
const newStory = createRoute({ getParentRoute: () => editorShell, path: "/new-story", beforeLoad: signedIn });
const editStory = createRoute({ getParentRoute: () => editorShell, path: "/p/$id/edit", beforeLoad: signedIn });

const routeTree = root.addChildren([
  shell.addChildren([
    home,
    article,
    articleAnon,
    profile,
    tag,
    search,
    list,
    series,
    pub,
    privacy,
    terms,
    legacyPost,
    ssoCallback,
    forgot,
    reset,
    verify,
    unsubscribe,
    library,
    stories,
    notifications,
    publications,
    stats,
    settings,
    diagrams,
    diagramProject,
    diagramFile,
    diagramShare,
    diagramView,
    templates,
  ]),
  editorShell.addChildren([newStory, editStory]),
]);

export const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: "intent", scrollRestoration: true, defaultViewTransition: true });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Page views for product analytics (sent only with consent).
router.subscribe("onResolved", ({ toLocation }) => track({ name: "page_view", path: toLocation.pathname }));

import { useBlocker, useNavigate } from "@tanstack/react-router";
import { Loader2Icon, LogInIcon } from "lucide-react";
import { lazy, Suspense, useCallback, useMemo, useRef } from "react";
import { engagementRepository } from "@/contexts/engagement/infrastructure/engagementRepository";
import { authDialog } from "@/contexts/identity/application/authDialog";
import { useMe, useToken } from "@/contexts/identity/application/session";
import { displayName } from "@/contexts/identity/domain/account";
import { http, tokens } from "@/shared/api";
import { useLang, useT } from "@/shared/i18n";
import { Button } from "@/shared/ui/button";
import { EmptyState } from "@/shared/ui/states";
import { useDark } from "@/shared/ui/theme";
import { PublishButton } from "./PublishDialog";

// The editor is its own chunk: nothing of it loads until a file or share route is opened.
const DiagramEditor = lazy(() => import("@diagram-editor").then((m) => ({ default: m.DiagramEditor })));
// The unsaved-changes check lives in the same chunk; it is only asked once the editor is loaded (before that nothing is dirty).
let guard: Promise<Pick<typeof import("@diagram-editor"), "hasUnsavedChanges" | "confirmLeave" | "flushPendingSaves">> | null = null;
const editor = () => {
  guard ??= import("@diagram-editor");
  return guard;
};

/** What the editor needs to sit in the page below the top bar (h-14). */
const frame = "h-[calc(100dvh-3.5rem)] w-full";

/** Shown while the editor chunk (several MB) downloads: a quiet status line, not a blank window. */
export function Booting({ className = frame }: { className?: string }) {
  const t = useT();
  return (
    <div className={`${className} grid place-items-center`} aria-busy="true" aria-live="polite">
      <p className="kicker flex items-center gap-2">
        <Loader2Icon className="size-3.5 animate-spin" aria-hidden /> {t("dg.booting")}
      </p>
    </div>
  );
}

/**
 * Hosts the diagram editor: bearer token from the session, light/dark from the page, URL changes of the editor mapped to
 * routes, and a 401 turned into one refresh attempt (the shared HTTP client rotates the token) before asking to sign in.
 */
export function EditorHost({ fileId, shareToken, commentId }: { fileId?: string; shareToken?: string; commentId?: string }) {
  const t = useT();
  const nav = useNavigate();
  const dark = useDark();
  const lang = useLang();
  const token = useToken();
  const { me, loading } = useMe();
  const refreshing = useRef(false);
  // moves the editor itself made ("back to projects", opening another file) were already put to the person by the editor's own guard
  const fromEditor = useRef(false);

  // Hook the router into the editor's unsaved-changes guard: leaving /d/f/* or /d/s/* by link, navbar or the browser's back button
  // asks the editor's own dialog (Save / Leave without saving / Stay) while there is unsaved work.
  useBlocker({
    shouldBlockFn: async () => {
      if (fromEditor.current) return false;
      const e = await editor();
      const stay = e.hasUnsavedChanges() && !(await e.confirmLeave());
      if (!stay) e.flushPendingSaves(); // going ahead: push what is still in the debounce window before the editor unmounts
      return stay;
    },
    enableBeforeUnload: false, // the editor registers its own beforeunload
  });

  const isShare = !!shareToken;
  const getAuthHeaders = useCallback((): Record<string, string> => {
    if (isShare) return {}; // a share link is its own credential: a stale session token must not turn it into a 401
    const t = tokens.get();
    return t ? { Authorization: `Bearer ${t.token}` } : {};
  }, [isShare]);
  // Realtime (MQTT over WebSocket, same-origin /mqtt): the editor asks for a single-use ticket (POST /me/stream-ticket) before EVERY
  // connect and reconnect and sends it as the MQTT password. A share link opens with its own token, so no ticket there.
  const getTicket = useCallback(() => engagementRepository.streamTicket(), []);
  const onUnauthorized = useCallback(() => {
    if (refreshing.current) return;
    refreshing.current = true;
    // any authenticated call: on 401 the client refreshes the token (and drops the session if that fails)
    void http("/me")
      .catch(() => authDialog.open("signin"))
      .finally(() => {
        refreshing.current = false;
      });
  }, []);
  const onNavigate = useCallback(
    (t: { to: "home" | "login" | "project" | "file"; projectId?: string; fileId?: string }, o: { replace: boolean }) => {
      if (t.to === "login") return;
      fromEditor.current = true;
      const done = () => {
        fromEditor.current = false;
      };
      if (t.to === "file" && t.fileId) void nav({ to: "/d/f/$fileId", params: { fileId: t.fileId }, replace: o.replace }).finally(done);
      else if (t.to === "project" && t.projectId) void nav({ to: "/d/p/$projectId", params: { projectId: t.projectId }, replace: o.replace }).finally(done);
      else void nav({ to: "/d", replace: o.replace }).finally(done);
    },
    [nav],
  );
  // the API answers /api/diagrams/share/{token}; people open links on this site's /d/s/{token}
  const shareUrl = useCallback((token: string) => `${window.location.origin}/d/s/${token}`, []);
  // publishing is the owner's: the editor says which role the person has on the open file
  const hostActions = useCallback((c: { fileId: string; role: string }) => (c.role === "owner" ? <PublishButton fileId={c.fileId} /> : null), []);
  const user = useMemo(() => (me ? { id: String(me.id), name: displayName(me), ...(me.email ? { email: me.email } : {}) } : null), [me]);

  // share links open without an account; files need one
  if (!shareToken) {
    if (!token)
      return (
        <EmptyState
          icon={LogInIcon}
          code="401 · sign in"
          title={t("dg.signIn.title")}
          body={t("dg.signIn.body")}
          action={<Button onClick={() => authDialog.open("signin")}>{t("auth.signIn")}</Button>}
        />
      );
    if (loading) return <Booting />;
  }
  return (
    <div className={frame}>
      <Suspense fallback={<Booting />}>
        <DiagramEditor
          {...(shareToken ? { shareToken } : fileId ? { fileId, ...(commentId ? { commentId } : {}) } : {})}
          theme={dark ? "dark" : "light"}
          lang={lang}
          user={user}
          getAuthHeaders={getAuthHeaders}
          {...(isShare ? {} : { getTicket })}
          onUnauthorized={onUnauthorized}
          onNavigate={onNavigate}
          shareUrl={shareUrl}
          {...(isShare ? {} : { hostActions })}
        />
      </Suspense>
    </div>
  );
}

/**
 * Embedding entry: the diagram editor as a component for a host app (the IWillBeGoogler site).
 *
 *   <DiagramEditor fileId="…" theme="dark" user={me} getAuthHeaders={…} onUnauthorized={…} onNavigate={…} />
 *   <DiagramEditor shareToken="…" />
 *   <DiagramEditor slug="…" />            (a published diagram, read-only, anonymous)
 *
 * The host owns sign-in (the editor has no login screens here: auth is the host's cookies / bearer header, and a 401 calls
 * `onUnauthorized`), the address bar (the editor keeps its route in memory and reports moves through `onNavigate`) and the
 * palette (`./embed/theme.css` re-points the editor's tokens at the host's CSS variables). Only one editor may be mounted at a time:
 * its stores are module singletons.
 */
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import './embed/theme.css';
import './data/bootstrap';
import { api, configureApi, onUnauthorized } from './api/api';
import { ApiError } from './api/client';
import { useSession } from './api/session';
import type { ApiUser } from './api/types';
import { AppContext } from './AppContext';
import { ProjectMessage, ProjectShell, Shell, useServerMirror } from './appParts';
import { Editor } from './components/Editor';
import { PublicDiagram, SharedProject } from './components/sync/SharedProject';
import { ToastLayer } from './components/ui/ToastLayer';
import { TooltipLayer } from './components/Tooltip';
import { openComment } from './comments/store';
import { getActiveEngine } from './sync/active';
import { flushProject } from './hooks/useProjectPersistence';
import { ALL_FEATURES, resetFeatures, setFeatures, type Features } from './lib/features';
import { setBrokerUrlOverride } from './realtime/config';
import { setHostActions, setHostRoot, setShareLinkBuilder, setTicketProvider, type HostActionContext } from './lib/host';
import { setAllowedIconMimes, setAssetUploader } from './lib/sdd/assets';
import { leaveNeeded, navigate, parseRoute, requestLeave, setEmbeddedPath, setEmbeddedRouter, useRoute, type Route } from './lib/router';
import { resolveTheme } from './lib/theme';
import { type Lang, setLang } from './i18n';
import { useDiagramStore } from './store/diagramStore';
import { useSettingsStore } from './store/settingsStore';
import { useUsageStore } from './store/usageStore';
import { filePath, projectPath } from './workspace/actions';
import { getWsProject, projectOfFile } from './workspace/storage';
import { useWorkspace } from './workspace/store';
import { captureActive } from './workspace/tabSession';
import { useWorkspaceRoute } from './workspace/useWorkspaceRoute';

export type { Features } from './lib/features';
export type { HostActionContext } from './lib/host';

/** the signed-in person, as the host knows them. The API speaks decimal-string ids; a host may pass its numeric ids (normalized with `String`). */
export interface EmbedUser {
  id: string | number;
  name: string;
  email?: string;
}

/** where the editor wants the host to go */
export type EmbedTarget = { to: 'home' } | { to: 'project'; projectId: string } | { to: 'file'; projectId: string; fileId: string } | { to: 'login' };

export interface DiagramEditorProps {
  /** open this file (its project is looked up through the API) */
  fileId?: string;
  /** open this comment thread once the file has loaded (a notification link: `?comment=<id>`) */
  commentId?: string;
  /** open a share link instead (`/share/:token` on the API base): no sign-in needed */
  shareToken?: string;
  /** open a published diagram (`/public/:slug` on the API base) read-only: no sign-in, no sync, no sockets, nothing saved in this browser */
  slug?: string;
  /** the diagram API; default `/api/diagrams` */
  apiBase?: string;
  /** `light` / `dark`, or `system`. Colours come from the host's CSS variables either way; this drives the canvas code. */
  theme?: 'light' | 'dark' | 'system';
  /** UI language of the editor chrome (`en` default). Diagram content is never translated. */
  lang?: Lang;
  /** the signed-in host user (needed for roles / "updated by"); `null` = anonymous */
  user?: EmbedUser | null;
  /** extra request headers, e.g. `() => ({ Authorization: 'Bearer …' })`. Cookies are always sent. */
  getAuthHeaders?: () => Record<string, string | undefined>;
  /** the API answered 401: the host should sign the person in again */
  onUnauthorized?: () => void;
  /** the editor moved (back to the list, another file, …): the host updates its URL */
  onNavigate?: (target: EmbedTarget, opts: { replace: boolean }) => void;
  /** the address of a share link for a token; default `<origin>/s/<token>`. The host serves the share route, so it says where. */
  shareUrl?: (token: string) => string;
  /**
   * Mint a single-use broker ticket (the host's `POST /api/me/stream-ticket` -> `ticket`). Called before EVERY MQTT connect and
   * reconnect (file and project connections: username `ticket`, the ticket as password). Share views use their share token
   * (username `share`) instead. Without it a signed-in editor has no realtime (the broker cannot read cookies).
   */
  getTicket?: () => Promise<string>;
  /**
   * The MQTT-over-WebSocket broker URL. Default: `ws(s)://<current host><wsPath>` where `wsPath` (`/mqtt`) comes from
   * `GET <apiBase>/realtime/config`; the host's proxy must route it to EMQX (Web: nginx `/mqtt`, Vite dev proxy).
   */
  mqttUrl?: string;
  /** switch features on/off; by default everything the diagram API does not serve yet is off (see `EMBED_FEATURES`) */
  features?: Partial<Features>;
  /**
   * The host's own buttons in the toolbar of an open file (next to Share), e.g. "Publish". Called with the open file and the person's
   * role; the nodes render inside the editor's tree, so the host's React context (router, query client) is available to them.
   */
  hostActions?: (ctx: HostActionContext) => React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * What an embedded editor may use by default: what `/api/diagrams` serves (projects, folders, files, tree, versions, prefs,
 * members, share links, private stickies, project library, thumbnails, comments + notifications) and its realtime channels (MQTT: file / project
 * events, Yjs co-editing, audio rooms). Still off: the host owns accounts, and live-database import. Realtime needs the host's
 * `getTicket` for signed-in people (share views use their token); comments fall back to polling only when `realtime` is switched off.
 */
export const EMBED_FEATURES: Features = { ...ALL_FEATURES, realtime: true, collab: true, rtc: true, accounts: false, schemaTools: false };

export const DEFAULT_API_BASE = '/api/diagrams';

/** image types the diagram API stores as assets (SVG is sanitized there and only ever shown through <img>) */
export const EMBED_IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'] as const;

/** is there work the editor would ask about before leaving (unsaved changes)? A host router calls this from its navigation blocker. */
export const hasUnsavedChanges = (): boolean => leaveNeeded();
/**
 * Ask the person about leaving, using the editor's own dialog (Save / Leave without saving / Stay). `true` = go ahead.
 * Resolves at once, with `true`, when there is nothing to ask.
 */
/**
 * Write every pending edit now: to this browser's storage and to the server (keepalive, so it survives the page going away).
 * A host router calls it as navigation proceeds; the editor itself calls the same on pagehide / hidden tab / unmount.
 */
export const flushPendingSaves = (): void => {
  flushProject();
  void getActiveEngine()?.flush({ keepalive: true });
};
export const confirmLeave = async (): Promise<boolean> => (await requestLeave()) === true;

/** editor route -> host target */
export function toTarget(path: string): EmbedTarget {
  const r: Route = parseRoute(path.split('?')[0]!);
  if (r.name === 'file') return { to: 'file', projectId: r.projectId, fileId: r.fileId };
  if (r.name === 'project') return { to: 'project', projectId: r.id };
  if (r.name === 'login' || r.name === 'register') return { to: 'login' };
  return { to: 'home' };
}

const toApiUser = (u: EmbedUser | null | undefined): ApiUser | null => (u ? { id: String(u.id), name: u.name, email: u.email ?? '', isAdmin: false } : null);

function Splash({ label }: { label: string }) {
  return <div className="landing-loading" aria-busy="true" aria-label={label} />;
}

/** one file of a project, found by file id */
function EmbeddedFile({ fileId, commentId }: { fileId: string; commentId?: string }) {
  const route = useRoute();
  useEffect(() => {
    if (commentId) openComment(fileId, commentId);
  }, [fileId, commentId]);
  const [error, setError] = useState<'missing' | 'network' | null>(null);
  // 1. the project of the file (local cache first, else the API); sets the in-memory route
  useEffect(() => {
    if (route.name === 'file' && route.fileId === fileId) return;
    let live = true;
    setError(null);
    const known = projectOfFile(localStorage, fileId);
    if (known) {
      setEmbeddedPath(filePath(known, fileId));
      return;
    }
    api.getFile(fileId).then(
      (r) => live && setEmbeddedPath(filePath(r.file.projectId, fileId)),
      (e: unknown) => {
        if (!live) return;
        if (e instanceof ApiError && e.isUnauthorized) return; // the host was told
        setError(e instanceof ApiError && !e.isNetwork ? 'missing' : 'network');
      },
    );
    return () => {
      live = false;
    };
  }, [fileId, route]);

  const mode = useSession((s) => s.mode);
  const authMode = useSession((s) => s.authMode);
  const user = useSession((s) => s.user);
  const ws = useWorkspaceRoute(route);
  const openFileRef = useRef<string | null>(null);
  openFileRef.current = ws.kind === 'ready' ? ws.fileId : null;
  useServerMirror(mode === 'server' && (authMode === 'none' || !!user), user?.id, openFileRef);

  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateUsage = useUsageStore((s) => s.hydrate);
  useEffect(() => {
    hydrateSettings();
    hydrateUsage();
  }, [hydrateSettings, hydrateUsage]);

  const back = <button type="button" onClick={() => navigate('/projects')}>Back to projects</button>;
  return (
    <AppContext.Provider
      value={{
        openProject: (id) => navigate(projectPath(id)),
        openFile: (p, f) => navigate(filePath(p, f)),
        goHome: () => navigate('/projects'),
        inEditor: ws.kind === 'ready',
      }}
    >
      <Shell>
        {error ? (
          <>
            <ProjectMessage title={error === 'missing' ? 'File not found' : 'Cannot reach the server'} hint={error === 'missing' ? 'It may have been deleted, or you do not have access.' : 'Check your connection and try again.'} action={back} />
            <ToastLayer />
          </>
        ) : ws.kind === 'ready' ? (
          <ProjectShell key={ws.projectId} projectId={ws.projectId} fileId={ws.fileId}>
            <Editor key={ws.fileId} fileId={ws.fileId} projectId={ws.projectId} onBack={() => navigate('/projects')} />
          </ProjectShell>
        ) : ws.kind === 'missing' ? (
          <>
            <ProjectMessage title={ws.what === 'project' ? 'Project not found' : 'File not found'} hint="It may have been deleted, or you do not have access." action={back} />
            <ToastLayer />
          </>
        ) : ws.kind === 'empty' ? (
          <>
            <ProjectMessage title={getWsProject(localStorage, ws.projectId)?.name ?? 'Project'} hint="This project has no files yet." action={back} />
            <ToastLayer />
          </>
        ) : (
          <Splash label="Opening file" />
        )}
      </Shell>
    </AppContext.Provider>
  );
}

function EmbeddedShare({ token }: { token: string }) {
  return (
    <Shell>
      <SharedProject token={token} />
      <TooltipLayer />
      <ToastLayer />
    </Shell>
  );
}

function EmbeddedPublic({ slug }: { slug: string }) {
  return (
    <Shell>
      <PublicDiagram slug={slug} />
      <TooltipLayer />
      <ToastLayer />
    </Shell>
  );
}

export function DiagramEditor({ fileId, commentId, shareToken, slug, apiBase = DEFAULT_API_BASE, theme = 'system', lang = 'en', user, getAuthHeaders, getTicket, mqttUrl, onUnauthorized: onUnauth, onNavigate, shareUrl, features: fx, hostActions, className, style }: DiagramEditorProps) {
  // before any child renders, so their first paint is already in the host's language (idempotent, so safe during render)
  setLang(lang);
  const [el, setEl] = useState<HTMLDivElement | null>(null);
  const fxKey = JSON.stringify(fx ?? {});
  const hasTicket = !!getTicket;
  // the host's callbacks change identity every render: the editor always calls the latest
  const cb = useRef({ onUnauth, onNavigate, getAuthHeaders, shareUrl, getTicket, hostActions });
  cb.current = { onUnauth, onNavigate, getAuthHeaders, shareUrl, getTicket, hostActions };
  const hasHostActions = !!hostActions;

  useLayoutEffect(() => {
    setHostActions(hasHostActions ? (ctx) => cb.current.hostActions?.(ctx) : null);
    return () => setHostActions(null);
  }, [hasHostActions]);

  // (re)configure the editor singletons for this host; runs before the editor mounts (children render only once `el` exists)
  useLayoutEffect(() => {
    configureApi({ baseUrl: apiBase, headers: () => cb.current.getAuthHeaders?.() ?? {} });
    onUnauthorized(() => cb.current.onUnauth?.());
    setFeatures({ ...EMBED_FEATURES, ...(JSON.parse(fxKey) as Partial<Features>) });
    setAllowedIconMimes(EMBED_IMAGE_TYPES);
    setAssetUploader(async (bytes, mime) => api.uploadAsset(new Blob([bytes as BlobPart], { type: mime })));
    setTicketProvider(hasTicket ? () => (cb.current.getTicket as () => Promise<string>)() : null);
    setBrokerUrlOverride(mqttUrl ?? null);
    setShareLinkBuilder((t) => (cb.current.shareUrl ? cb.current.shareUrl(t) : `${window.location.origin}/s/${t}`));
  }, [apiBase, fxKey, hasTicket, mqttUrl]);
  const fxOn = { ...EMBED_FEATURES, ...(fx ?? {}) };
  const uid = user?.id === undefined || user.id === '' ? undefined : String(user.id);
  const uname = user?.name;
  const uemail = user?.email;
  useLayoutEffect(() => {
    const u = toApiUser(uid ? { id: uid, name: uname ?? '', ...(uemail ? { email: uemail } : {}) } : null);
    useSession.setState({ mode: 'server', authMode: 'session', allowSignup: false, collab: fxOn.realtime && fxOn.collab, rtc: fxOn.realtime && fxOn.rtc, oidc: null, saml: null, user: u, lastCheckedAt: Date.now() });
  }, [uid, uname, uemail, fxOn.collab, fxOn.rtc]);

  // the in-memory router: starts on the share / file route; host callbacks report every move
  useLayoutEffect(() => {
    setEmbeddedRouter({
      path: shareToken ? `/s/${shareToken}` : '/', // a neutral start: 'back to projects' must differ from it
      onNavigate: (path, o) => {
        const t = toTarget(path);
        if (t.to === 'login') cb.current.onUnauth?.();
        cb.current.onNavigate?.(t, o);
      },
    });
    return () => setEmbeddedRouter(null);
  }, [shareToken]);

  // the root element: portals, the theme attribute and fullscreen all live inside it
  const themeRef = useRef(theme);
  themeRef.current = theme;
  const paint = (node: HTMLElement) => {
    node.dataset.theme = resolveTheme(themeRef.current, !!window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  };
  const setRoot = (node: HTMLDivElement | null) => {
    if (node) paint(node); // before the editor renders: it reads the theme from this attribute
    setHostRoot(node);
    setEl(node);
  };
  useEffect(() => {
    if (!el) return;
    const apply = () => paint(el);
    apply();
    if (theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [el, theme]);

  // leaving: save what is open, forget the project, hand the page back untouched
  useEffect(
    () => () => {
      if (useWorkspace.getState().projectId) {
        flushProject();
        captureActive(useDiagramStore.getState().projectId);
        useWorkspace.getState().unload();
      }
      setHostRoot(null);
      resetFeatures();
      setAllowedIconMimes(null);
      setAssetUploader(null);
      setShareLinkBuilder(null);
      setTicketProvider(null);
      onUnauthorized(() => undefined);
    },
    [],
  );

  return (
    <div ref={setRoot} className={`sdd-root sdd-embed${className ? ` ${className}` : ''}`} style={style}>
      {el && (slug ? <EmbeddedPublic slug={slug} /> : shareToken ? <EmbeddedShare token={shareToken} /> : fileId ? <EmbeddedFile fileId={fileId} commentId={commentId} /> : null)}
    </div>
  );
}

export default DiagramEditor;

import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import '@xyflow/react/dist/style.css';
import './styles.css';
import { Editor } from './components/Editor';
import { ProjectsHome } from './components/ProjectsHome';
import { SettingsModal } from './components/SettingsModal';
import { TooltipLayer } from './components/Tooltip';
import { ensureWorkspace, getProjectSync, getWsProject } from './workspace/storage';
import { useWorkspaceRoute } from './workspace/useWorkspaceRoute';
import { filePath, newFileDialog, projectPath } from './workspace/actions';
import { useSettingsStore } from './store/settingsStore';
import { useUsageStore } from './store/usageStore';
import { ToastLayer } from './components/ui/ToastLayer';
import './data/bootstrap';
import { AppContext } from './AppContext';
import { DialogHost } from './components/ui/DialogHost';
import { ProjectMessage, ProjectShell, Shell, useServerMirror } from './appParts';
import { resolveTheme } from './lib/theme';
import { navigate, useRoute } from './lib/router';
import { api, onUnauthorized } from './api/api';
import { bootstrapSession, guardRedirect, useSession } from './api/session';
import { AuthPage } from './components/auth/AuthPage';
import { SharedProject } from './components/sync/SharedProject';
import { uploadLocalProject } from './sync/runtime';
import { t } from './i18n';

const Landing = lazy(() => import('./landing/Landing'));

function useTheme() {
  const theme = useSettingsStore((s) => s.global.theme) ?? 'system';
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = !!window.matchMedia?.('(prefers-color-scheme: dark)').matches;
      const next = resolveTheme(theme, dark);
      if (root.dataset.theme && root.dataset.theme !== next) {
        root.classList.add('theme-fade'); // smooth crossfade
        setTimeout(() => root.classList.remove('theme-fade'), 320);
      }
      root.dataset.theme = next;
    };
    apply();
    if (theme !== 'system' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, [theme]);
}

function LocalOnlyNotice() {
  return (
    <main className="auth">
      <div className="auth-card">
        <h1>{t('Server not reachable')}</h1>
        <p className="muted">{t('Accounts and share links need the backend. The editor still works offline with projects saved in this browser.')}</p>
        <button type="button" onClick={() => navigate('/projects')}>{t('Open local projects')}</button>
      </div>
    </main>
  );
}

export default function App({ initialProjectId = null }: { initialProjectId?: string | null }) {
  const route = useRoute();
  // old single-diagram autosave -> project, then the one-time migration to Project > Folder > File (before anything renders)
  useState(() => {
    try {
      ensureWorkspace(localStorage);
      if (initialProjectId) navigate(projectPath(initialProjectId), { replace: true });
    } catch {
      /* ignore */
    }
  });
  const openProject = (id: string) => {
    // logged in: a project created a moment ago is uploaded right away so it syncs from the first edit (older local ones use the banner)
    const s = useSession.getState();
    const p = getWsProject(localStorage, id);
    const fresh = !!p && Date.now() - p.createdAt < 15000 && !getProjectSync(localStorage, id);
    const go = () => navigate(projectPath(id));
    if (fresh && s.mode === 'server' && (s.authMode === 'none' || s.user)) void uploadLocalProject(api, localStorage, id).then(go, go); // offline: stays local, the banner offers it later
    else go();
  };
  const openFileRoute = (projectId: string, fileId: string) => {
    const s = useSession.getState();
    const p = getWsProject(localStorage, projectId);
    const fresh = !!p && Date.now() - p.createdAt < 15000 && !getProjectSync(localStorage, projectId);
    const go = () => navigate(filePath(projectId, fileId));
    if (fresh && s.mode === 'server' && (s.authMode === 'none' || s.user)) void uploadLocalProject(api, localStorage, projectId).then(go, go);
    else go();
  };
  // backend detection (GET /auth/config): any failure means local mode, the app then works exactly as before
  const mode = useSession((s) => s.mode);
  const authMode = useSession((s) => s.authMode);
  const user = useSession((s) => s.user);
  useEffect(() => {
    onUnauthorized(() => useSession.getState().setUser(null));
    if (useSession.getState().mode === 'checking') void bootstrapSession(api);
  }, []);
  // route guard: protected routes need a session when the server wants one; /login bounces when already in
  const redirect = guardRedirect(route, window.location.pathname + window.location.search, { mode, authMode, user });
  useEffect(() => {
    if (redirect) navigate(redirect, { replace: true });
  }, [redirect]);
  // /p/:project[/f/:file] -> workspace loaded + file shown in the editor store
  const ws = useWorkspaceRoute(redirect ? { name: 'landing' } : route);
  const openFileId = ws.kind === 'ready' ? ws.fileId : null;
  const openFileRef = useRef<string | null>(null);
  openFileRef.current = openFileId;
  const ready = mode === 'server' && (authMode === 'none' || !!user);
  useServerMirror(ready, user?.id, openFileRef);
  const hydrateSettings = useSettingsStore((s) => s.hydrate);
  const hydrateUsage = useUsageStore((s) => s.hydrate);
  useEffect(() => {
    hydrateSettings();
    hydrateUsage();
  }, [hydrateSettings, hydrateUsage]);
  useTheme();

  const inEditor = ws.kind === 'ready';
  const inProject = route.name === 'project' || route.name === 'file';
  return (
    <AppContext.Provider value={{ openProject, openFile: openFileRoute, goHome: () => navigate('/projects'), inEditor }}>
      <Shell>
        {route.name === 'landing' ? (
          <Suspense fallback={<div className="landing-loading" aria-busy="true" />}>
            <Landing />
            <ToastLayer />
          </Suspense>
        ) : route.name === 'login' || route.name === 'register' ? (
          mode === 'checking' ? <div className="landing-loading" aria-busy="true" /> : mode === 'local' ? <LocalOnlyNotice /> : (
            <>
              <AuthPage mode={route.name} next={new URLSearchParams(window.location.search).get('next')} />
              <ToastLayer />
            </>
          )
        ) : route.name === 'share' ? (
          mode === 'local' ? <LocalOnlyNotice /> : mode === 'checking' ? <div className="landing-loading" aria-busy="true" /> : (
            <>
              <SharedProject token={route.token} />
              <TooltipLayer />
              <ToastLayer />
              <DialogHost />
            </>
          )
        ) : mode === 'checking' && (route.name === 'projects' || inProject) ? (
          <div className="landing-loading" aria-busy="true" aria-label={t('Connecting')} />
        ) : redirect ? null : ws.kind === 'ready' ? (
          <ProjectShell key={ws.projectId} projectId={ws.projectId} fileId={ws.fileId}>
            <Editor key={ws.fileId} fileId={ws.fileId} projectId={ws.projectId} onBack={() => navigate('/projects')} />
          </ProjectShell>
        ) : inProject && ws.kind === 'missing' ? (
          <>
            <ProjectMessage title={ws.what === 'project' ? t('Project not found') : t('File not found')} hint={t('It may have been deleted, or you do not have access.')} action={<button type="button" onClick={() => navigate('/projects')}>{t('Back to projects')}</button>} />
            <ToastLayer />
          </>
        ) : inProject && ws.kind === 'empty' ? (
          <>
            <ProjectMessage
              title={getWsProject(localStorage, ws.projectId)?.name ?? t('Project')}
              hint={t('This project has no files yet.')}
              action={
                <>
                  <button type="button" className="primary" onClick={() => void newFileDialog(null)}>{t('New file')}</button>{' '}
                  <button type="button" onClick={() => navigate('/projects')}>{t('Back to projects')}</button>
                </>
              }
            />
            <ToastLayer />
            <DialogHost />
          </>
        ) : inProject ? (
          <div className="landing-loading" aria-busy="true" aria-label={t('Opening project')} />
        ) : route.name === 'projects' ? (
          <>
            <ProjectsHome onOpen={openProject} />
            <SettingsModal />
            <TooltipLayer />
            <ToastLayer />
          </>
        ) : null}
      </Shell>
    </AppContext.Provider>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../api/api';
import { ApiError } from '../../api/client';
import type { Role } from '../../api/types';
import { navigate } from '../../lib/router';
import { useDiagramStore } from '../../store/diagramStore';
import { clearTabSessions } from '../../workspace/tabSession';
import { Editor } from '../Editor';
import { t } from '../../i18n';

type SharedFile = { id: string; name: string };
type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; id: string; role: Role; version: number; files: SharedFile[] };

/**
 * /s/:token: open a shared file (file links) or a shared project (project links: a file picker above the editor) with no login.
 * Viewer links are read-only; editor links save with If-Match.
 */
export function SharedProject({ token }: { token: string }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [fileId, setFileId] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    const fail = (e: unknown) =>
      live &&
      setState({ kind: 'error', message: e instanceof ApiError && e.isNetwork ? t('Cannot reach the server.') : e instanceof ApiError && (e.status === 404 || e.status === 410 || e.status === 403) ? t('This link is invalid, expired or was revoked.') : t('Could not open this link.') });
    (async () => {
      const opened = await api.openShared(token);
      const role = opened.share.role;
      let files: SharedFile[] = [];
      let file = opened.file;
      let version = opened.version ?? opened.file?.version ?? 0;
      if (opened.share.scope === 'project') {
        files = (opened.files ?? []).map((f) => ({ id: f.id, name: f.name }));
        const wanted = fileId && files.some((f) => f.id === fileId) ? fileId : files[0]?.id;
        if (!wanted) throw new ApiError(404, 'NOT_FOUND', 'This project has no files');
        const r = await api.getShared(token, wanted);
        file = r.file;
        version = r.version;
      }
      if (!live || !file) return;
      clearTabSessions();
      useDiagramStore.getState().loadProject({ ...file.data, id: file.id, name: file.name });
      setState({ kind: 'ready', id: file.id, role, version, files });
    })().catch(fail);
    return () => {
      live = false;
    };
  }, [token, fileId]);
  if (state.kind === 'loading') return <div className="landing-loading" aria-busy="true" aria-label={t('Opening shared project')} />;
  if (state.kind === 'error')
    return (
      <main className="auth">
        <div className="auth-card">
          <h1>{t('Link unavailable')}</h1>
          <p className="error" role="alert">{state.message}</p>
          <button type="button" onClick={() => navigate('/')}>{t('Go to the app')}</button>
        </div>
      </main>
    );
  return (
    <>
      {state.files.length > 1 && (
        <label className="shared-files glass">
          <span>{t('File')}</span>
          <select aria-label={t('Shared file')} value={state.id} onChange={(e) => setFileId(e.target.value)}>
            {state.files.map((f) => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
        </label>
      )}
      <Editor key={state.id} fileId={state.id} onBack={() => navigate('/projects')} sync={{ source: 'share', token, role: state.role, baseVersion: state.version }} />
    </>
  );
}

/**
 * A published diagram (`/public/:slug`), read-only, for anyone. Unlike a share link there is no token, no save path and no socket:
 * the document is loaded into the editor and the session is a viewer's (`source: 'public'` in `useProjectSync`).
 */
export function PublicDiagram({ slug }: { slug: string }) {
  const [state, setState] = useState<{ kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ready'; id: string }>({ kind: 'loading' });
  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    api.getPublic(slug).then(
      (d) => {
        if (!live) return;
        clearTabSessions();
        useDiagramStore.getState().loadProject({ ...d.data, id: d.file_id, name: d.title || d.data.name });
        setState({ kind: 'ready', id: d.file_id });
      },
      (e: unknown) =>
        live &&
        setState({ kind: 'error', message: e instanceof ApiError && e.isNetwork ? t('Cannot reach the server.') : e instanceof ApiError && e.status === 404 ? t('This diagram is not published, or was taken down.') : t('Could not open this diagram.') }),
    );
    return () => {
      live = false;
    };
  }, [slug]);
  if (state.kind === 'loading') return <div className="landing-loading" aria-busy="true" aria-label={t('Opening diagram')} />;
  if (state.kind === 'error')
    return (
      <main className="auth">
        <div className="auth-card">
          <h1>{t('Diagram unavailable')}</h1>
          <p className="error" role="alert">{state.message}</p>
          <button type="button" onClick={() => navigate('/')}>{t('Go to the app')}</button>
        </div>
      </main>
    );
  return <Editor key={state.id} fileId={state.id} onBack={() => navigate('/projects')} sync={{ source: 'public' }} />;
}

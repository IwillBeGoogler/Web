import { useState } from 'react';
import { CloudUpload } from 'lucide-react';
import { api } from '../../api/api';
import { useSession } from '../../api/session';
import { localOnlyProjects, uploadLocalProject } from '../../sync/runtime';
import { useLibrary } from '../../sync/library';
import { toast } from '../../store/toastStore';
import { t } from '../../i18n';

const DISMISS_KEY = 'sdd:upload-banner-dismissed';
const dismissed = (): number => {
  try {
    return Number(localStorage.getItem(DISMISS_KEY) ?? 0);
  } catch {
    return 0;
  }
};

/** "N projects only exist in this browser: upload them" (shown once logged in; Not now hides it until more local-only projects appear). */
export function UploadBanner({ onDone, upload = (id: string) => uploadLocalProject(api, localStorage, id) }: { onDone?: () => void; upload?: (id: string) => Promise<void> }) {
  const mode = useSession((s) => s.mode);
  const authMode = useSession((s) => s.authMode);
  const user = useSession((s) => s.user);
  const rev = useLibrary((s) => s.rev);
  const [busy, setBusy] = useState(false);
  const [hiddenAt, setHiddenAt] = useState(dismissed);
  void rev; // re-read after a sync
  if (mode !== 'server' || (authMode === 'session' && !user)) return null;
  const local = localOnlyProjects(localStorage);
  if (local.length === 0 || local.length <= hiddenAt) return null;
  const run = async () => {
    setBusy(true);
    let ok = 0;
    let firstError: string | null = null;
    for (const p of local) {
      try {
        await upload(p.id);
        ok++;
      } catch (e) {
        firstError ??= e instanceof Error ? e.message : 'failed';
      }
    }
    setBusy(false);
    if (ok) toast.success(t(ok === 1 ? 'Uploaded {n} project to the server' : 'Uploaded {n} projects to the server', { n: ok }));
    if (firstError) toast.error(t('{n} could not be uploaded: {err}', { n: local.length - ok, err: firstError }));
    useLibrary.getState().bump();
    onDone?.();
  };
  return (
    <section className="upload-banner" role="region" aria-label={t('Upload local projects')}>
      <CloudUpload size={16} aria-hidden />
      <span><strong>{t(local.length === 1 ? '{n} project' : '{n} projects', { n: local.length })}</strong> {t(local.length === 1 ? 'only exists in this browser.' : 'only exist in this browser.')}</span>
      <span className="spacer" />
      <button type="button" className="primary" disabled={busy} onClick={() => void run()}>{busy ? t('Uploading…') : t('Upload to server')}</button>
      <button
        type="button"
        disabled={busy}
        onClick={() => {
          try {
            localStorage.setItem(DISMISS_KEY, String(local.length));
          } catch {
            /* ignore */
          }
          setHiddenAt(local.length);
        }}
      >
        {t('Not now')}
      </button>
    </section>
  );
}

import { useEffect, useRef, useState } from 'react';
import { installFromText, installFromUrl, usePlugins } from '../../lib/plugins/store';
import { SAMPLE_PLUGINS } from '../../lib/plugins/samples';
import { toast } from '../../store/toastStore';
import { t } from '../../i18n';

/** Settings › Plugins: install from a URL or a local file, the three samples, enable / disable, remove. Plugins run sandboxed (see docs). */
export function PluginSettings() {
  const plugins = usePlugins((s) => s.plugins);
  const hydrate = usePlugins((s) => s.hydrate);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  useEffect(() => hydrate(), [hydrate]);
  const report = (r: { ok: true; plugin: { name: string } } | { ok: false; error: string }) => (r.ok ? toast.success(t('Installed “{name}”', { name: r.plugin.name })) : toast.error(r.error));
  const samples = SAMPLE_PLUGINS.filter((s) => !plugins.some((p) => p.name === s.name));
  return (
    <fieldset className="plugin-settings">
      <legend>{t('Plugins')}</legend>
      <p className="muted">{t('Plugins run in a sandbox: no cookies, no network, no access to the app. They can only use the permissions listed below.')}</p>
      {plugins.length === 0 && <p className="muted">{t('None installed.')}</p>}
      <ul className="plugin-manage">
        {plugins.map((p) => (
          <li key={p.id}>
            <label className="prop-check"><input type="checkbox" aria-label={t('Enable {name}', { name: p.name })} checked={p.enabled} onChange={(e) => usePlugins.getState().setEnabled(p.id, e.target.checked)} /> <b>{p.name}</b> <small>{p.version}</small></label>
            <small className="perms">{p.permissions.length ? p.permissions.join(' · ') : t('no permissions')}</small>
            <button type="button" aria-label={t('Remove {name}', { name: p.name })} onClick={() => usePlugins.getState().remove(p.id)}>{t('Remove')}</button>
          </li>
        ))}
      </ul>
      <div className="plugin-install">
        <input type="url" aria-label={t('Plugin manifest URL')} placeholder="https://example.com/plugin/manifest.json" value={url} onChange={(e) => setUrl(e.target.value)} />
        <button type="button" disabled={!url.trim() || busy} onClick={async () => { setBusy(true); report(await installFromUrl(url.trim())); setBusy(false); setUrl(''); }}>{t('Install from URL')}</button>
        <button type="button" onClick={() => file.current?.click()}>{t('Install from file…')}</button>
        <input ref={file} type="file" accept="application/json,.json" hidden aria-label={t('Plugin manifest file')} onChange={async (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) report(installFromText(await f.text())); }} />
      </div>
      {samples.length > 0 && (
        <div className="plugin-samples">
          <span className="prop-label">{t('Samples')}</span>
          <div className="btn-row">
            {samples.map((s) => (<button key={s.name} type="button" title={s.description} onClick={() => report(usePlugins.getState().install(s))}>+ {s.name}</button>))}
          </div>
        </div>
      )}
    </fieldset>
  );
}

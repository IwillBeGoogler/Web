import { useEffect, useMemo, useRef, useState } from 'react';
import { Puzzle, X } from 'lucide-react';
import { useUiStore } from '../../store/uiStore';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { PluginHost, type Reply } from '../../lib/plugins/host';
import { buildSandboxDoc, SANDBOX_ATTR } from '../../lib/plugins/sandbox';
import { usePlugins } from '../../lib/plugins/store';
import type { InstalledPlugin } from '../../lib/plugins/manifest';
import { t } from '../../i18n';

const docAdapter = {
  nodes: () => useDiagramStore.getState().nodes,
  edges: () => useDiagramStore.getState().edges,
  transform: (fn: Parameters<ReturnType<typeof useDiagramStore.getState>['transform']>[0]) => useDiagramStore.getState().transform(fn),
};

/**
 * One running plugin: a sandboxed iframe (scripts only, opaque origin, strict CSP) whose postMessage calls go through a PluginHost.
 * Messages from any other window are ignored. The iframe is visible only after the plugin asked for a panel.
 */
export function PluginFrame({ plugin, args, onResult, onClose }: { plugin: InstalledPlugin; args?: unknown; onResult: (r: { ok: boolean; value?: unknown; error?: string }) => void; onClose: () => void }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [panel, setPanel] = useState<{ title?: string; height?: number } | null>(null);
  const doc = useMemo(() => buildSandboxDoc(plugin.code), [plugin.code]);
  const result = useRef(onResult);
  result.current = onResult;
  useEffect(() => {
    const host = new PluginHost(plugin, { doc: docAdapter, notify: (m, k) => toast[k === 'error' ? 'error' : k === 'success' ? 'success' : 'info'](`${plugin.name}: ${m}`), panel: (o) => setPanel(o) });
    const post = (msg: unknown) => frame.current?.contentWindow?.postMessage(msg, '*');
    const onMsg = async (e: MessageEvent) => {
      if (!frame.current || e.source !== frame.current.contentWindow) return; // only our own iframe
      const d = e.data as { sdd?: number; event?: string; ok?: boolean; value?: unknown; error?: string } | null;
      if (d && typeof d === 'object' && d.sdd === 1 && typeof d.event === 'string') {
        if (d.event === 'ready') post({ sdd: 1, event: 'run', args });
        else if (d.event === 'result') result.current({ ok: d.ok === true, value: d.value, error: typeof d.error === 'string' ? d.error.slice(0, 300) : undefined });
        return;
      }
      const reply: Reply | null = await host.handle(e.data);
      if (reply) post(reply);
    };
    window.addEventListener('message', onMsg);
    return () => window.removeEventListener('message', onMsg);
  }, [plugin, args]);
  return (
    <div className={`plugin-frame${panel ? ' shown' : ''}`} data-testid={`plugin-frame-${plugin.id}`}>
      {panel && (
        <div className="plugin-frame-head"><b>{panel.title ?? plugin.name}</b><button type="button" aria-label={t('Close plugin panel')} onClick={onClose}><X size={13} aria-hidden /></button></div>
      )}
      <iframe ref={frame} title={t('Plugin: {name}', { name: plugin.name })} sandbox={SANDBOX_ATTR} srcDoc={doc} referrerPolicy="no-referrer" style={panel ? { height: panel.height ?? 200 } : { height: 0 }} />
    </div>
  );
}

/** ⌘K "Plugins…": a small popover listing the enabled plugins with Run buttons; empty (and absent) until a plugin is installed. */
export function PluginPanel() {
  const open = useUiStore((s) => s.pluginsOpen);
  const setDesign = useUiStore((s) => s.setDesign);
  const plugins = usePlugins((s) => s.plugins);
  const hydrate = usePlugins((s) => s.hydrate);
  const [running, setRunning] = useState<{ plugin: InstalledPlugin; key: number } | null>(null);
  const [out, setOut] = useState<string | null>(null);
  useEffect(() => hydrate(), [hydrate]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setDesign({ pluginsOpen: false });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, setDesign]);
  const enabled = plugins.filter((p) => p.enabled);
  if (!open) return null;
  return (
    <div className="plugin-pop glass" role="dialog" aria-label={t('Plugins')}>
      <div className="plugin-pop-head"><Puzzle size={14} aria-hidden /><b>{t('Plugins')}</b><button type="button" aria-label={t('Close plugins')} onClick={() => setDesign({ pluginsOpen: false })}><X size={13} aria-hidden /></button></div>
      {enabled.length === 0 ? (
        <p className="muted pad">{t('No plugins enabled. Install some in Settings › Plugins.')}</p>
      ) : (
        <ul className="plugin-list">
          {enabled.map((p) => (
            <li key={p.id}>
              <span><b>{p.name}</b>{p.description && <small>{p.description}</small>}<small className="perms">{p.permissions.length ? p.permissions.join(' · ') : t('no permissions')}</small></span>
              <button type="button" className="btn" aria-label={t('Run {name}', { name: p.name })} onClick={() => { setOut(null); setRunning({ plugin: p, key: Date.now() }); }}>{t('Run')}</button>
            </li>
          ))}
        </ul>
      )}
      {running && (
        <PluginFrame
          key={running.key}
          plugin={running.plugin}
          onResult={(r) => {
            if (!r.ok) toast.error(`${running.plugin.name}: ${r.error ?? t('failed')}`);
            else if (typeof r.value === 'string') setOut(r.value.slice(0, 100_000));
            setRunning(null);
          }}
          onClose={() => setRunning(null)}
        />
      )}
      {out !== null && (
        <div className="plugin-out">
          <pre aria-label={t('Plugin output')}>{out}</pre>
          <button type="button" className="btn" onClick={() => void navigator.clipboard?.writeText(out).then(() => toast.success(t('Copied')), () => toast.error(t('Could not use the clipboard')))}>{t('Copy')}</button>
        </div>
      )}
    </div>
  );
}

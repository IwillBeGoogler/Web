import { useMemo, useState } from 'react';
import { Copy } from 'lucide-react';
import { useDiagramStore } from '../../store/diagramStore';
import { inspectProps, snippetsFor, sourceLinkOf } from '../../lib/devmode/devmode';
import { toast } from '../../store/toastStore';
import { t } from '../../i18n';

const px = (n: number) => `${Math.round(n * 10) / 10}`;
async function copy(text: string, what: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(t('Copied {what}', { what }));
  } catch {
    toast.error(t('Could not use the clipboard'));
  }
}

/** Dev mode (⇧D): a read-only inspect panel for the selected node: measurements, colours, fonts, copyable snippets and the source link. */
export function DevPanel() {
  const nodes = useDiagramStore((s) => s.nodes);
  const edges = useDiagramStore((s) => s.edges);
  const node = nodes.find((n) => n.selected);
  const edge = !node ? edges.find((e) => e.selected) : undefined;
  const [open, setOpen] = useState<string | null>('json');
  const props = useMemo(() => (node ? inspectProps(node, nodes) : null), [node, nodes]);
  const snippets = useMemo(() => (node ? snippetsFor(node, nodes, edges) : []), [node, nodes, edges]);
  const src = node ? sourceLinkOf(node) : null;
  if (!node && edge) {
    const json = JSON.stringify({ id: edge.id, source: edge.source, target: edge.target, label: edge.label, data: edge.data }, null, 2);
    return (
      <div className="dev-panel" data-testid="dev-panel" aria-label={t('Dev mode')}>
        <p className="dev-tag">Dev mode · {edge.id}</p>
        <button type="button" className="btn" onClick={() => void copy(json, 'JSON')}><Copy size={13} aria-hidden /> {t('Copy JSON')}</button>
        <pre className="dev-code">{json}</pre>
      </div>
    );
  }
  if (!node || !props) return <p className="muted pad">{t('Select something to inspect it.')}</p>;
  const g = props.geometry;
  return (
    <div className="dev-panel" data-testid="dev-panel" aria-label={t('Dev mode')}>
      <p className="dev-tag">Dev mode · {props.kind} “{props.label}”</p>
      <dl className="dev-props">
        <dt>{t('Position')}</dt><dd>{px(g.x)}, {px(g.y)}</dd>
        <dt>{t('Size')}</dt><dd>{px(g.width)} × {px(g.height)}</dd>
        {props.colors.fill && (<><dt>{t('Fill')}</dt><dd><i className="dev-chip" style={{ background: props.colors.fill }} />{props.colors.fill}</dd></>)}
        {props.colors.stroke && (<><dt>{t('Stroke')}</dt><dd><i className="dev-chip" style={{ background: props.colors.stroke }} />{props.colors.stroke}</dd></>)}
        {props.colors.text && (<><dt>{t('Text')}</dt><dd><i className="dev-chip" style={{ background: props.colors.text }} />{props.colors.text}</dd></>)}
        {props.font.size !== undefined && (<><dt>{t('Font')}</dt><dd>{props.font.size}px{props.font.bold ? ' bold' : ''}{props.font.align ? ` · ${props.font.align}` : ''}</dd></>)}
        {src && (<><dt>{t('Source')}</dt><dd>{src.href ? <a href={src.href} target="_blank" rel="noopener noreferrer">{src.label}</a> : <code>{src.label}</code>}</dd></>)}
      </dl>
      <div className="dev-snips" role="group" aria-label={t('Copy as')}>
        <span className="prop-label">{t('Copy as')}</span>
        <div className="btn-row">
          {snippets.map((s) => (<button key={s.id} type="button" className={`btn${open === s.id ? ' on' : ''}`} aria-pressed={open === s.id} onClick={() => setOpen(open === s.id ? null : s.id)}>{s.label}</button>))}
        </div>
        {snippets.filter((s) => s.id === open).map((s) => (
          <div key={s.id} className="dev-snippet">
            <button type="button" className="btn" aria-label={t('Copy {what}', { what: s.label })} onClick={() => void copy(s.code, s.label)}><Copy size={13} aria-hidden /> {t('Copy {what}', { what: s.label })}</button>
            <pre className="dev-code" aria-label={t('{what} snippet', { what: s.label })}>{s.code}</pre>
          </div>
        ))}
      </div>
    </div>
  );
}

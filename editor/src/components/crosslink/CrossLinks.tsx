import { useMemo } from 'react';
import { ArrowUpRight, Link2Off } from 'lucide-react';
import { useDiagramStore } from '../../store/diagramStore';
import { useWorkspace } from '../../workspace/store';
import { buildProjectIndex, currentPlace } from '../../lib/crosslink/projectIndex';
import { jumpToLoc, jumpToRef } from '../../lib/crosslink/jump';
import { archRefOf, backlinksOf, candidatesOf, isArchTarget, isLinkSource, makeRef, resolveRef, type ProjectIndex } from '../../lib/crosslink/links';
import type { DiagramNode } from '../../types';
import '../../styles/crosslink.css';
import { t } from '../../i18n';

/** the workspace project index, rebuilt when the canvas or the file tree changes */
export function useProjectIndex(): ProjectIndex {
  const nodes = useDiagramStore((s) => s.nodes);
  const pages = useDiagramStore((s) => s.pages);
  const stash = useDiagramStore((s) => s.stash);
  const tree = useWorkspace((s) => s.tree);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => buildProjectIndex(), [nodes, pages, stash, tree]);
}

/** badge on a class / component / table: names the architecture node it belongs to; click jumps there; red when the target is gone */
export function CrossLinkBadge({ id, data }: { id: string; data: unknown }) {
  const ref = archRefOf(data);
  if (!ref) return null;
  return <Badge id={id} ref0={ref} />;
}
function Badge({ id, ref0 }: { id: string; ref0: NonNullable<ReturnType<typeof archRefOf>> }) {
  const index = useProjectIndex();
  const r = resolveRef(ref0, currentPlace(), index);
  return (
    <button
      type="button"
      className={`xlink-badge nodrag${r.ok ? '' : ' broken'}`}
      data-testid={`xlink-badge-${id}`}
      title={r.ok ? t('Go to {label} ({file} / {page})', { label: r.node.label, file: r.file.name, page: r.page.name }) : t('Broken link: {reason}', { reason: r.reason })}
      onClick={(e) => { e.stopPropagation(); jumpToRef(ref0); }}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {r.ok ? <ArrowUpRight size={11} aria-hidden /> : <Link2Off size={11} aria-hidden />}
      <span>{r.ok ? r.node.label || r.node.id : t('broken link')}</span>
    </button>
  );
}

/** inspector rows: a class / component / table picks its architecture node; an architecture node lists what links to it */
export function CrossLinkInspector({ node, readOnly }: { node: DiagramNode; readOnly?: boolean }) {
  const index = useProjectIndex();
  const update = useDiagramStore((s) => s.updateNodeData);
  const from = currentPlace();
  const cands = useMemo(() => candidatesOf(index, from), [index, from.fileId, from.pageId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (isLinkSource(node)) {
    const ref = archRefOf(node.data);
    const r = ref ? resolveRef(ref, from, index) : null;
    const cur = r?.ok ? cands.findIndex((c) => c.loc.fileId === r.loc.fileId && c.loc.pageId === r.loc.pageId && c.loc.nodeId === r.loc.nodeId) : -1;
    return (
      <div className="xlink-section" data-testid="xlink-inspector">
        <div className="prop-row">
          <span className="prop-label">{t('Owned by')}</span>
          <select
            aria-label={t('Architecture node')}
            disabled={readOnly}
            value={ref ? (cur >= 0 ? String(cur) : 'broken') : ''}
            onChange={(e) => {
              const v = e.target.value;
              if (v === 'broken') return;
              update(node.id, { archRef: v === '' ? undefined : makeRef(cands[Number(v)].loc, from) });
            }}
          >
            <option value="">{t('(none)')}</option>
            {ref && cur < 0 && <option value="broken">{t('Broken: {id}', { id: ref.nodeId })}</option>}
            {cands.map((c, i) => <option key={`${c.loc.fileId}/${c.loc.pageId}/${c.loc.nodeId}`} value={i}>{c.label}{c.loc.fileId !== from.fileId ? ` · ${c.fileName}` : c.loc.pageId !== from.pageId ? ` · ${c.pageName}` : ''}</option>)}
          </select>
        </div>
        {r && !r.ok && <p className="xlink-broken" role="alert"><Link2Off size={12} aria-hidden /> {t('Broken link: {reason}. Pick another node or clear it.', { reason: r.reason })}</p>}
        {ref && (
          <div className="btn-row">
            {r?.ok && <button type="button" onClick={() => jumpToRef(ref)}>{t('Go to node')}</button>}
            {!readOnly && <button type="button" onClick={() => update(node.id, { archRef: undefined })}>{t('Clear link')}</button>}
          </div>
        )}
        {!cands.length && <p className="muted" style={{ fontSize: 'var(--fs-xs)' }}>{t('No architecture nodes (icons or cards) in this project yet.')}</p>}
      </div>
    );
  }
  if (isArchTarget(node)) {
    const links = backlinksOf({ ...from, nodeId: node.id }, index);
    if (!links.length) return <p className="muted" style={{ fontSize: 'var(--fs-xs)' }} data-testid="xlink-backlinks">{t('No class, component or table links here yet. Pick this node in their inspector.')}</p>;
    return (
      <div className="xlink-section" data-testid="xlink-backlinks">
        <div className="prop-label">{t('Linked from ({n})', { n: links.length })}</div>
        <ul className="xlink-list">
          {links.map((l) => (
            <li key={`${l.loc.fileId}/${l.loc.pageId}/${l.loc.nodeId}`}>
              <button type="button" onClick={() => jumpToLoc(l.loc)} title={`${l.file.name} / ${l.page.name}`}>
                <span className="xlink-type">{l.node.type}</span> {l.node.label || l.node.id}
                {l.loc.fileId !== from.fileId || l.loc.pageId !== from.pageId ? <span className="muted"> · {l.file.name}{l.loc.fileId === from.fileId ? ` / ${l.page.name}` : ''}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return null;
}

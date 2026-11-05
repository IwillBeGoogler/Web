import { useMemo, useState } from 'react';
import { MessageSquarePlus, X } from 'lucide-react';
import { diffReport, propChanges } from '@core/diff';
import { absolutePosition, nodeSize } from '../../lib/graph';
import { downloadText } from '../../lib/export';
import { flowRef } from '../../lib/board/flowRef';
import { showProblem } from '../../lib/smart/lintBridge';
import { useCommentsStore } from '../../comments/store';
import { useDiagramStore } from '../../store/diagramStore';
import { useLayoutStore } from '../../store/layoutStore';
import { useSmart } from '../../store/smartStore';
import { toast } from '../../store/toastStore';
import { useDiffStore } from '../../versions/diffStore';
import { canComment as roleCanComment } from '../../lib/roles';
import { useEditorSession } from '../../sync/status';
import type { DiagramNode } from '../../types';
import { t } from '../../i18n';

type Rec = Record<string, unknown> & { id: string; data?: { label?: string } };
const labelOf = (r: Rec) => String(r.data?.label || r.id);

interface Row { key: string; kind: 'added' | 'removed' | 'changed'; what: 'node' | 'edge'; rec: Rec; before?: Rec; notes: string[] }

/** Review panel: every added / removed / changed item of the comparison with its property changes; click to zoom, comment, export a report. */
export function ReviewPanel() {
  const open = useSmart((s) => s.diff);
  const diff = useDiffStore((s) => s.diff);
  const from = useDiffStore((s) => s.from);
  const to = useDiffStore((s) => s.to);
  const sidebarOpen = useLayoutStore((s) => s.sidebarOpen);
  const nodes = useDiagramStore((s) => s.nodes);
  const fileId = useDiagramStore((s) => s.projectId);
  const commentsFile = useCommentsStore((s) => s.fileId);
  const threads = useCommentsStore((s) => s.threads);
  const role = useEditorSession((s) => s.role);
  const [writing, setWriting] = useState<string | null>(null);
  const [text, setText] = useState('');
  const rows = useMemo<Row[]>(() => {
    if (!diff) return [];
    const out: Row[] = [];
    const nm = new Map<string, string>();
    for (const n of [...diff.nodes.added, ...diff.nodes.removed, ...diff.nodes.changed.map((c) => c.after)]) nm.set(n.id, labelOf(n as Rec));
    for (const n of nodes) nm.set(n.id, String(n.data.label || n.id));
    const edgeName = (e: Rec) => `${nm.get(String(e.source)) ?? e.source} → ${nm.get(String(e.target)) ?? e.target}${e.label ? ` “${String(e.label)}”` : ''}`;
    for (const r of diff.nodes.added) out.push({ key: `na-${r.id}`, kind: 'added', what: 'node', rec: r as Rec, notes: [] });
    for (const r of diff.nodes.removed) out.push({ key: `nr-${r.id}`, kind: 'removed', what: 'node', rec: r as Rec, notes: [] });
    for (const c of diff.nodes.changed) out.push({ key: `nc-${c.id}`, kind: 'changed', what: 'node', rec: c.after as Rec, before: c.before as Rec, notes: propChanges(c.before as Rec, c.after as Rec).map((p) => p.text) });
    for (const r of diff.edges.added) out.push({ key: `ea-${r.id}`, kind: 'added', what: 'edge', rec: { ...(r as Rec), data: { label: edgeName(r as Rec) } }, notes: [] });
    for (const r of diff.edges.removed) out.push({ key: `er-${r.id}`, kind: 'removed', what: 'edge', rec: { ...(r as Rec), data: { label: edgeName(r as Rec) } }, notes: [] });
    for (const c of diff.edges.changed) out.push({ key: `ec-${c.id}`, kind: 'changed', what: 'edge', rec: { ...(c.after as Rec), data: { label: edgeName(c.after as Rec) } }, before: c.before as Rec, notes: propChanges(c.before as Rec, c.after as Rec).map((p) => p.text) });
    return out;
  }, [diff, nodes]);
  if (!open || !diff) return null;
  const close = () => { useSmart.getState().setDiff(false); useDiffStore.getState().clear(); };
  const canComment = roleCanComment(role ?? 'viewer') && commentsFile === fileId && !!fileId;

  const zoom = (r: Row) => {
    if (r.what === 'edge') {
      const e = r.rec;
      if (r.kind !== 'removed') showProblem([String(e.source), String(e.target)], [e.id]);
      return;
    }
    if (r.kind !== 'removed') return showProblem([r.rec.id]);
    const n = r.rec as unknown as DiagramNode;
    const p = n.parentId ? absolutePosition(nodes, n) : n.position;
    const s = nodeSize(n);
    void flowRef.current?.setCenter(p.x + s.width / 2, p.y + s.height / 2, { zoom: 1, duration: 350 });
  };
  const send = async (r: Row) => {
    const body = `Review (${from} → ${to}): ${text.trim()}`;
    const exists = r.what === 'node' && r.kind !== 'removed' && nodes.some((n) => n.id === r.rec.id);
    const pos = (r.rec as unknown as DiagramNode).position ?? { x: 0, y: 0 };
    const anchor = exists ? ({ type: 'node', nodeId: r.rec.id, dx: 0, dy: 0 } as const) : ({ type: 'point', x: pos.x, y: pos.y } as const);
    try {
      await useCommentsStore.getState().add({ body, anchor });
      setWriting(null);
      setText('');
      toast.success(t('Comment added'));
    } catch (e) {
      toast.error(t('Could not comment: {msg}', { msg: e instanceof Error ? e.message : String(e) }));
    }
  };
  const exportReport = () => {
    const ids = new Set(rows.filter((r) => r.what === 'node').map((r) => r.rec.id));
    const comments = threads.filter((t) => t.root.body.startsWith('Review (')).flatMap((t) => [t.root, ...t.replies]).map((c) => ({ nodeId: c.anchor?.type === 'node' && ids.has(c.anchor.nodeId) ? c.anchor.nodeId : undefined, author: c.author.name, body: c.body.replace(/^Review \([^)]*\):\s*/, '') }));
    const title = useDiagramStore.getState().projectName || 'Diagram';
    downloadText(diffReport(diff, { title, from, to, nodes: nodes as unknown as Rec[], comments }), `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'diagram'}-changes.md`, 'text/markdown');
  };
  const sign = { added: '+', removed: '−', changed: '~' } as const;
  return (
    <aside className="review-panel glass" style={{ left: sidebarOpen ? 316 : 64 }} aria-label={t('Review changes')} data-testid="review-panel">
      <div className="layers-head">
        <b>{from} → {to}</b>
        <button type="button" className="problems-rules" onClick={exportReport}>{t('Export report')}</button>
        <button type="button" className="layers-x" aria-label={t('Close review')} onClick={close}><X size={13} aria-hidden /></button>
      </div>
      <div className="review-legend muted"><i className="diff-dot added" /> {t('added')} <i className="diff-dot removed" /> {t('removed')} <i className="diff-dot changed" /> {t('changed')} <span>· {rows.length} item{rows.length === 1 ? '' : 's'}</span></div>
      <div className="problems-body">
        {!rows.length && <p className="muted pad">{t('No differences.')}</p>}
        {rows.map((r) => (
          <div key={r.key} className={`review-row diff-row-${r.kind}`}>
            <button type="button" className="problem-main" onClick={() => zoom(r)} data-testid={`review-${r.kind}`}>
              <span className={`review-sign ${r.kind}`} aria-hidden>{sign[r.kind]}</span>
              <span className="problem-msg">{labelOf(r.rec)}{r.what === 'edge' ? '' : ''}</span>
              <span className="problem-rule">{r.kind} {r.what}{r.notes.length ? `: ${r.notes.join('; ')}` : ''}</span>
            </button>
            {canComment && <button type="button" className="problem-fix" aria-label={t('Comment on {label}', { label: labelOf(r.rec) })} onClick={() => { setWriting(writing === r.key ? null : r.key); setText(''); }}><MessageSquarePlus size={13} aria-hidden /></button>}
            {writing === r.key && (
              <form className="review-compose" onSubmit={(e) => { e.preventDefault(); if (text.trim()) void send(r); }}>
                <input autoFocus aria-label={t('Review comment')} value={text} onChange={(e) => setText(e.target.value)} placeholder={t('Comment on this change')} />
                <button type="submit" disabled={!text.trim()}>{t('Add')}</button>
              </form>
            )}
          </div>
        ))}
      </div>
    </aside>
  );
}

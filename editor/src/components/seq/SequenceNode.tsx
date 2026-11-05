import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { useStore, type NodeProps } from '@xyflow/react';
import { BoxSelect, ListOrdered, MessageSquarePlus, StickyNote, Trash2, UserPlus, Link2 } from 'lucide-react';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { addBox, addFragment, addMessage, addNote, addParticipant, addRef, addSection, findItem, leafOrder, moveItem, moveParticipant, nextParticipant, removeBox, removeItem, removeParticipant, retargetMessage, setMessageExt, setNumbering, updateBox, updateItem, updateParticipant, updateSection } from '../../lib/seq/edit';
import { isGlyph, layoutSequence, SEQ, type LaidMessage } from '../../lib/seq/layout';
import { sequenceOf } from '../../lib/seq/node';
import { FRAGMENT_OPS, MESSAGE_KINDS, PARTICIPANT_KINDS, isMessage, type FragmentOp, type MessageKind, type ParticipantKind, type SequenceData } from '../../lib/seq/types';
import '../../styles/uml2.css';
import { t } from '../../i18n';

type Sel = { t: 'part' | 'msg' | 'note' | 'frag' | 'ref'; id: string } | null;
type Field = { t: 'part' | 'msg' | 'note' | 'ref' | 'box' | 'guard' | 'title'; id: string };
/** dragging one end of a message onto another lifeline */
type EndDrag = { id: string; end: 'from' | 'to'; x: number; to: string } | null;
type Drag = { t: 'part' | 'item'; id: string; pos: number; to: number } | null;

/** tiny inline editor: Enter / blur commit, Escape cancels, Tab commits and asks for the next field */
function SeqInput({ value, style, label, multiline, onCommit, onDone, onTab }: { value: string; style: CSSProperties; label: string; multiline?: boolean; onCommit: (v: string) => void; onDone: () => void; onTab?: (dir: 1 | -1) => void }) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit && v !== value) onCommit(v);
    onDone();
  };
  const props = {
    value: v, autoFocus: true, className: 'nodrag nopan seq-input', style, 'aria-label': t(label),
    onFocus: (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => e.currentTarget.select(),
    onChange: (e: { target: { value: string } }) => setV(e.target.value),
    onBlur: () => finish(true),
    onKeyDown: (e: RKeyboardEvent) => {
      e.stopPropagation();
      if (e.key === 'Escape') finish(false);
      else if (e.key === 'Enter' && (!multiline || e.metaKey || e.ctrlKey)) { e.preventDefault(); finish(true); }
      else if (e.key === 'Tab' && onTab) { e.preventDefault(); const dir = e.shiftKey ? -1 : 1; finish(true); onTab(dir); }
    },
  };
  return multiline ? <textarea rows={2} {...props} /> : <input type="text" {...props} />;
}

function Glyph({ kind, cx, top }: { kind: string; cx: number; top: number }) {
  const t = top;
  switch (kind) {
    case 'actor':
      return <g className="seq-glyph"><circle cx={cx} cy={t + 6} r={5.5} /><path d={`M${cx} ${t + 11.5}V${t + 23}M${cx - 10} ${t + 16}H${cx + 10}M${cx} ${t + 23}L${cx - 8} ${t + 33}M${cx} ${t + 23}L${cx + 8} ${t + 33}`} /></g>;
    case 'boundary':
      return <g className="seq-glyph"><circle cx={cx + 4} cy={t + 17} r={11} /><path d={`M${cx - 15} ${t + 17}H${cx - 7}M${cx - 15} ${t + 8}V${t + 26}`} /></g>;
    case 'control':
      return <g className="seq-glyph"><circle cx={cx} cy={t + 19} r={11} /><path d={`M${cx - 2} ${t + 5}L${cx + 3} ${t + 8}L${cx - 2} ${t + 11}`} /></g>;
    case 'entity':
      return <g className="seq-glyph"><circle cx={cx} cy={t + 16} r={11} /><path d={`M${cx - 12} ${t + 31}H${cx + 12}`} /></g>;
    default:
      return <g className="seq-glyph"><path d={`M${cx - 13} ${t + 8}V${t + 28}A13 5 0 0 0 ${cx + 13} ${t + 28}V${t + 8}`} /><ellipse cx={cx} cy={t + 8} rx={13} ry={5} /></g>;
  }
}

function Arrow({ m }: { m: LaidMessage }) {
  const dir = m.x2 >= m.x1 ? 1 : -1;
  const open = m.kind !== 'sync';
  const x = m.x2, y = m.y;
  if (m.kind === 'destroy' || m.self) {
    if (!m.self) return <g className="seq-cross"><path d={`M${x - 8} ${y - 8}L${x + 8} ${y + 8}M${x + 8} ${y - 8}L${x - 8} ${y + 8}`} /></g>;
  }
  if (m.ext === 'lost') return <circle className="seq-dot" cx={x} cy={y} r={4.5} />;
  const sx = m.self ? m.x1 : x;
  const dx = m.self ? -1 : -dir;
  const pts = `${sx + dx * 9},${y - 4.5} ${sx},${y} ${sx + dx * 9},${y + 4.5}`;
  return open ? <polyline points={pts} className="seq-head open" /> : <polygon points={pts} className="seq-head filled" />;
}

export function SequenceNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const d = sequenceOf({ data } as DiagramNode);
  const locked = !!data.locked;
  const update = useDiagramStore((s) => s.updateSequence);
  const zoom = useStore((s) => s.transform[2]);
  const L = layoutSequence(d);
  const svgRef = useRef<SVGSVGElement>(null);
  const [sel, setSel] = useState<Sel>(null);
  const [edit, setEdit] = useState<Field | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  const [endDrag, setEndDrag] = useState<EndDrag>(null);
  useEffect(() => { if (!selected) { setSel(null); setEdit(null); } }, [selected]);
  // F2 / Rename in the menu ask for the diagram title
  const renaming = useUiStore((s) => s.editingId === id);
  useEffect(() => {
    if (renaming) { setEdit({ t: 'title', id }); useUiStore.getState().setEditing(null); }
  }, [renaming, id]);
  const edit_ = (fn: (x: SequenceData) => SequenceData) => update(id, fn);
  const part = (pid: string) => L.participants.find((p) => p.id === pid);

  const toLocal = (clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    const s = r && L.width ? r.width / L.width : zoom || 1;
    return { x: r ? (clientX - r.left) / s : 0, y: r ? (clientY - r.top) / s : 0 };
  };

  /** start a drag: below 4px it is a plain click (select) */
  const beginDrag = (e: RPointerEvent, kind: 'part' | 'item', itemId: string, select: Sel) => {
    e.stopPropagation();
    setSel(select);
    if (locked || e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    let moved = false, to = -1;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      const p = toLocal(ev.clientX, ev.clientY);
      if (kind === 'part') to = L.participants.filter((q) => q.id !== itemId && q.x < p.x).length;
      else {
        const others = [...L.messages.map((m) => ({ id: m.id, y: m.y })), ...L.notes.map((n) => ({ id: n.id, y: n.y + n.h / 2 })), ...L.refs.map((r) => ({ id: r.id, y: r.y + r.h / 2 }))].filter((o) => o.id !== itemId).sort((a, b) => a.y - b.y);
        to = others.filter((o) => o.y < p.y).length;
      }
      setDrag({ t: kind, id: itemId, pos: kind === 'part' ? p.x : p.y, to });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (moved && to >= 0) edit_((x) => (kind === 'part' ? (moveParticipant(x, itemId, to) as SequenceData) : (moveItem(x, itemId, to) as SequenceData)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  /** drag a message end; releasing over (or nearest to) another lifeline moves that end there */
  const beginEndDrag = (e: RPointerEvent, msgId: string, end: 'from' | 'to') => {
    e.stopPropagation();
    if (locked || e.button !== 0) return;
    let to = '';
    const nearest = (x: number) => L.participants.reduce((best, q) => (Math.abs(q.x - x) < Math.abs(best.x - x) ? q : best), L.participants[0]);
    const move = (ev: PointerEvent) => {
      const x = toLocal(ev.clientX, ev.clientY).x;
      to = nearest(x).id;
      setEndDrag({ id: msgId, end, x, to });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setEndDrag(null);
      if (to) edit_((x) => retargetMessage(x, msgId, end, to) as SequenceData);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onKey = (e: RKeyboardEvent) => {
    if (edit || !selected || locked) return;
    if (e.key === 'Delete' || e.key === 'Backspace') {
      if (!sel) return;
      e.preventDefault(); e.stopPropagation();
      edit_((x) => (sel.t === 'part' ? (removeParticipant(x, sel.id) as SequenceData) : (removeItem(x, sel.id) as SequenceData)));
      setSel(null);
    } else if (e.key === 'Enter' && sel && sel.t !== 'frag') {
      e.preventDefault(); e.stopPropagation();
      setEdit({ t: sel.t, id: sel.id });
    } else if (sel && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && (sel.t === 'msg' || sel.t === 'note')) {
      e.preventDefault(); e.stopPropagation();
      const order = leafOrder(d).map((l) => l.id);
      const i = order.indexOf(sel.id);
      const to = i + (e.key === 'ArrowDown' ? 1 : -1);
      if (i >= 0 && to >= 0 && to < order.length) edit_((x) => moveItem(x, sel.id, to) as SequenceData);
    } else if (sel?.t === 'part' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault(); e.stopPropagation();
      const i = d.participants.findIndex((p) => p.id === sel.id);
      edit_((x) => moveParticipant(x, sel.id, i + (e.key === 'ArrowRight' ? 1 : -1)) as SequenceData);
    } else if (sel?.t === 'part' && e.key === 'Tab') {
      const nxt = nextParticipant(d, sel.id, e.shiftKey ? -1 : 1);
      if (nxt) { e.preventDefault(); e.stopPropagation(); setSel({ t: 'part', id: nxt }); }
    }
  };

  const tabFrom = (pid: string) => (dir: 1 | -1) => {
    const nxt = nextParticipant(d, pid, dir);
    if (nxt) { setSel({ t: 'part', id: nxt }); setEdit({ t: 'part', id: nxt }); return; }
    if (dir === 1) {
      // Tab on the last participant adds a new one and edits it
      const before = new Set(d.participants.map((p) => p.id));
      let newId = '';
      edit_((x) => {
        const r = addParticipant(x) as SequenceData;
        newId = r.participants.find((p) => !before.has(p.id))!.id;
        return r;
      });
      setSel({ t: 'part', id: newId });
      setEdit({ t: 'part', id: newId });
    }
  };

  const selId = sel?.id;
  const afterSel = sel && (sel.t === 'msg' || sel.t === 'note') ? sel.id : undefined;
  const btn = (label: string, icon: React.ReactNode, fn: () => void, text?: string) => (
    <button type="button" className="seq-btn nodrag" aria-label={t(label)} title={t(label)} onClick={fn} disabled={locked}>{icon}{text ? <span className="seq-btn-text" data-text={t(text)} /> : null}</button>
  );
  const labelStyle = (x: number, y: number, w: number): CSSProperties => ({ left: x - w / 2, top: y, width: w });

  return (
    <div className={`seq${selected ? ' selected' : ''}`} style={{ width: L.width, height: L.height, ['--seq-accent' as string]: d.accent }} tabIndex={-1} onKeyDown={onKey} data-testid={`sequence-${id}`}>
      {selected && !locked && (
        <div className="seq-toolbar nodrag nopan" role="toolbar" aria-label={t('Sequence tools')}>
          {btn('Add participant', <UserPlus size={13} aria-hidden />, () => edit_((x) => addParticipant(x, { after: sel?.t === 'part' ? sel.id : undefined }) as SequenceData), 'Participant')}
          {btn('Add message', <MessageSquarePlus size={13} aria-hidden />, () => edit_((x) => addMessage(x, { after: afterSel }) as SequenceData), 'Message')}
          {btn('Add note', <StickyNote size={13} aria-hidden />, () => edit_((x) => addNote(x, { after: afterSel, over: sel?.t === 'part' ? [sel.id] : undefined }) as SequenceData), 'Note')}
          {btn('Add ref frame', <Link2 size={13} aria-hidden />, () => edit_((x) => addRef(x, { after: afterSel, over: sel?.t === 'part' ? [sel.id] : undefined }) as SequenceData), 'Ref')}
          {sel?.t === 'part' && (d.boxes ?? []).some((b) => b.participants.includes(sel.id))
            ? btn('Remove participant box', <BoxSelect size={13} aria-hidden />, () => edit_((x) => { const b = (x.boxes ?? []).find((q) => q.participants.includes(sel.id)); return (b ? removeBox(x, b.id) : x) as SequenceData; }), 'Un-box')
            : btn('Group participant in a box', <BoxSelect size={13} aria-hidden />, () => sel?.t === 'part' && edit_((x) => addBox(x, [sel.id], 'Group') as SequenceData), 'Box')}
          <select className="seq-select nodrag" aria-label={t('Add fragment')} value="" onChange={(e) => { const op = e.target.value as FragmentOp; if (op) edit_((x) => addFragment(x, op, sel && (sel.t === 'msg' || sel.t === 'note') ? [sel.id] : []) as SequenceData); }}>
            <option value="">{t('Fragment…')}</option>
            {FRAGMENT_OPS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          {btn(d.autonumber ? 'Turn numbering off' : 'Turn numbering on', <ListOrdered size={13} aria-hidden />, () => edit_((x) => setNumbering(x, !x.autonumber) as SequenceData), d.autonumber ? '1·2·3 on' : '1·2·3')}
          {sel?.t === 'msg' && (
            <select className="seq-select nodrag" aria-label={t('Message type')} value={(findItem(d, sel.id) as { kind?: string } | undefined)?.kind ?? 'sync'} onChange={(e) => edit_((x) => updateItem(x, sel.id, { kind: e.target.value as MessageKind }) as SequenceData)}>
              {MESSAGE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
          {sel?.t === 'part' && (
            <select className="seq-select nodrag" aria-label={t('Participant type')} value={part(sel.id)?.kind ?? 'participant'} onChange={(e) => edit_((x) => updateParticipant(x, sel.id, { kind: e.target.value as ParticipantKind }) as SequenceData)}>
              {PARTICIPANT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
          )}
          {sel?.t === 'msg' && (() => {
            const m = findItem(d, sel.id);
            if (!m || !isMessage(m)) return null;
            const pick = (key: 'from' | 'to', label: string) => (
              <select className="seq-select nodrag" aria-label={t(label)} title={t(label)} value={m[key]} onChange={(e) => edit_((x) => retargetMessage(x, m.id, key, e.target.value) as SequenceData)}>
                {d.participants.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            );
            const ends = (
              <select className="seq-select nodrag" aria-label={t('Message ends')} value={m.ext ?? 'normal'} onChange={(e) => edit_((x) => setMessageExt(x, m.id, e.target.value === 'normal' ? undefined : (e.target.value as 'found' | 'lost')) as SequenceData)}>
                <option value="normal">{t('between lifelines')}</option><option value="found">{t('found')}</option><option value="lost">{t('lost')}</option>
              </select>
            );
            return m.ext ? <>{ends}{pick('to', 'Message lifeline')}</> : <>{ends}{pick('from', 'Message from')}<span aria-hidden>→</span>{pick('to', 'Message to')}</>;
          })()}
          {sel?.t === 'msg' && (() => { const m = findItem(d, sel.id); return m && isMessage(m) && !m.ext ? btn('Swap direction', null, () => edit_((x) => updateItem(x, m.id, { from: m.to, to: m.from }) as SequenceData), '⇄') : null; })()}
          {sel && btn('Delete selected', <Trash2 size={13} aria-hidden />, () => { edit_((x) => (sel.t === 'part' ? (removeParticipant(x, sel.id) as SequenceData) : (removeItem(x, sel.id) as SequenceData))); setSel(null); })}
        </div>
      )}
      <svg ref={svgRef} width={L.width} height={L.height} className="seq-svg" role="group" aria-label={t('Sequence diagram {name}', { name: d.label })} onPointerDown={() => setSel(null)}>
        <rect className="seq-frame" x={0.75} y={0.75} width={L.width - 1.5} height={L.height - 1.5} rx={6} />
        <g className="nodrag" onDoubleClick={() => !locked && setEdit({ t: 'title', id })}>
          <path className="seq-tab" d={`M0.75 0.75H${Math.max(60, d.label.length * 7 + 36)}V${SEQ.titleH - 8}L${Math.max(60, d.label.length * 7 + 36) - 8} ${SEQ.titleH}H0.75Z`} />
          <text className="seq-tab-text" x={10} y={19}>sd {d.label}</text>
        </g>

        {L.boxes.map((b) => (
          <g key={b.id} className="seq-box nodrag" onDoubleClick={() => !locked && setEdit({ t: 'box', id: b.id })}>
            <rect className="seq-box-rect" x={b.x} y={b.y} width={b.w} height={b.h} rx={4} style={b.color ? { fill: b.color, fillOpacity: 0.28 } : undefined} />
            <text className="seq-box-label" x={b.x + b.w / 2} y={b.y + 15} textAnchor="middle">{b.label}</text>
          </g>
        ))}

        {L.participants.map((p) => (
          <line key={`l-${p.id}`} className="seq-life" x1={p.x} x2={p.x} y1={p.lifeTop} y2={p.lifeBottom} />
        ))}

        {L.fragments.map((f) => (
          <g key={f.id} className={`seq-frag nodrag${sel?.t === 'frag' && selId === f.id ? ' sel' : ''}`}>
            <rect className={`seq-frag-box${f.op === 'rect' ? ' bg' : ''}`} style={f.op === 'rect' ? { fill: f.sections[0]?.guard || '#dce8fc', fillOpacity: 0.4 } : undefined} x={f.x} y={f.y} width={f.w} height={f.h} rx={3} onPointerDown={(e) => { e.stopPropagation(); setSel({ t: 'frag', id: f.id }); }} />
            {f.sections.filter((s) => s.divider).map((s) => <line key={s.id} className="seq-frag-div" x1={f.x} x2={f.x + f.w} y1={s.y - 4} y2={s.y - 4} />)}
          </g>
        ))}

        {L.activations.map((a, i) => <rect key={i} className="seq-act" x={a.x} y={a.y1} width={SEQ.actW} height={a.y2 - a.y1} />)}

        {/* operator tabs and guards sit above lifelines and activation bars so they stay readable */}
        {L.fragments.map((f) => {
          const tabW = f.op.length * 7 + 20;
          if (f.op === 'rect') return null;
          return (
            <g key={`t-${f.id}`} className={`seq-frag nodrag${sel?.t === 'frag' && selId === f.id ? ' sel' : ''}`}>
              <path className="seq-frag-tab" d={`M${f.x} ${f.y}h${tabW}v12l-8 8H${f.x}z`} onPointerDown={(e) => { e.stopPropagation(); setSel({ t: 'frag', id: f.id }); }} />
              <text className="seq-frag-op" x={f.x + 8} y={f.y + 14}>{f.op}</text>
              {f.sections.map((s, i) => (
                <text key={s.id} className="seq-guard" x={i === 0 ? f.x + tabW + 8 : f.x + 8} y={i === 0 ? f.y + 15 : s.y + 11} onDoubleClick={() => !locked && setEdit({ t: 'guard', id: s.id })}>{s.guard ? `[${s.guard}]` : i === 0 ? '' : '[ ]'}</text>
              ))}
            </g>
          );
        })}

        {L.notes.map((n) => (
          <g key={n.id} className={`seq-note nodrag${sel?.t === 'note' && selId === n.id ? ' sel' : ''}${drag?.id === n.id ? ' dragging' : ''}`} onPointerDown={(e) => beginDrag(e, 'item', n.id, { t: 'note', id: n.id })} onDoubleClick={() => !locked && setEdit({ t: 'note', id: n.id })}>
            <path className="seq-note-box" d={`M${n.x} ${n.y}H${n.x + n.w - 10}L${n.x + n.w} ${n.y + 10}V${n.y + n.h}H${n.x}Z`} />
            {n.lines.map((ln, i) => <text key={i} className="seq-note-text" x={n.x + 8} y={n.y + 18 + i * SEQ.noteLine}>{ln}</text>)}
          </g>
        ))}

        {L.refs.map((r) => (
          <g key={r.id} className={`seq-ref nodrag${sel?.t === 'ref' && selId === r.id ? ' sel' : ''}${drag?.id === r.id ? ' dragging' : ''}`} onPointerDown={(e) => beginDrag(e, 'item', r.id, { t: 'ref', id: r.id })} onDoubleClick={() => !locked && setEdit({ t: 'ref', id: r.id })}>
            <rect className="seq-ref-box" x={r.x} y={r.y} width={r.w} height={r.h} rx={3} />
            <path className="seq-frag-tab" d={`M${r.x} ${r.y}h40v12l-8 8H${r.x}z`} />
            <text className="seq-frag-op" x={r.x + 8} y={r.y + 14}>ref</text>
            <text className="seq-ref-text" x={r.x + r.w / 2} y={r.y + r.h / 2 + 8} textAnchor="middle">{r.text.split('\n')[0]}</text>
          </g>
        ))}

        {L.messages.map((m) => {
          const dash = m.kind === 'return' || m.kind === 'create';
          const path = m.self
            ? `M${m.x1} ${m.y}H${m.x1 + m.loopW}V${m.y + SEQ.selfLoopH}H${m.x1 + 2}`
            : `M${m.x1 + (m.x2 > m.x1 ? 1 : -1) * (m.kind === 'sync' || m.kind === 'return' ? 0 : 0)} ${m.y}H${m.x2}`;
          const isSel = sel?.t === 'msg' && selId === m.id;
          const lab = (m.number ? `${m.number}. ` : '') + m.text;
          return (
            <g key={m.id} className={`seq-msg nodrag${isSel ? ' sel' : ''}${drag?.id === m.id ? ' dragging' : ''}${dash ? ' dashed' : ''}`} onPointerDown={(e) => beginDrag(e, 'item', m.id, { t: 'msg', id: m.id })} onDoubleClick={() => !locked && setEdit({ t: 'msg', id: m.id })}>
              <path className="seq-hit" d={path} />
              <path className="seq-line" d={path} strokeDasharray={dash ? '6 4' : undefined} />
              {m.self ? <Arrow m={{ ...m, y: m.y + SEQ.selfLoopH, x1: m.x1 + 2 }} /> : <Arrow m={m} />}
              {m.ext === 'found' && <circle className="seq-dot" cx={m.x1} cy={m.y} r={4.5} />}
              <text className="seq-label" x={m.self ? m.labelX : m.labelX} y={m.y - 7} textAnchor={m.self ? 'start' : 'middle'}>{lab}</text>
            </g>
          );
        })}

        {L.participants.map((p) => {
          const isSel = sel?.t === 'part' && selId === p.id;
          const textY = isGlyph(p.kind) ? p.boxTop + SEQ.glyphH + 15 : p.boxTop + p.boxH / 2 + 4.5;
          return (
            <g key={p.id} className={`seq-part nodrag${isSel ? ' sel' : ''}${drag?.id === p.id ? ' dragging' : ''}`} tabIndex={0} role="button" aria-label={t('Participant {name}', { name: p.name })}
              onPointerDown={(e) => beginDrag(e, 'part', p.id, { t: 'part', id: p.id })} onDoubleClick={() => !locked && setEdit({ t: 'part', id: p.id })}
              onFocus={() => selected && setSel({ t: 'part', id: p.id })}>
              <rect className="seq-part-hit" x={p.boxX} y={p.boxTop} width={p.boxW} height={p.boxH} rx={5} fill={isGlyph(p.kind) ? 'transparent' : undefined} />
              {isGlyph(p.kind) && <Glyph kind={p.kind} cx={p.x} top={p.boxTop} />}
              <text className="seq-part-name" x={p.x} y={textY} textAnchor="middle">{p.name}</text>
              {p.destroyY !== undefined && <g className="seq-cross"><path d={`M${p.x - 8} ${p.destroyY - 8}L${p.x + 8} ${p.destroyY + 8}M${p.x + 8} ${p.destroyY - 8}L${p.x - 8} ${p.destroyY + 8}`} /></g>}
            </g>
          );
        })}

        {sel?.t === 'msg' && !locked && (() => {
          const m = L.messages.find((x) => x.id === sel.id);
          if (!m || m.self) return null;
          const ends: { end: 'from' | 'to'; x: number }[] = m.ext ? [{ end: m.ext === 'found' ? 'to' : 'from', x: m.ext === 'found' ? m.x2 : m.x1 }] : [{ end: 'from', x: m.x1 }, { end: 'to', x: m.x2 }];
          return ends.map((h) => <circle key={h.end} className="seq-handle nodrag" data-testid={`seq-end-${h.end}`} cx={h.x} cy={m.y} r={6} onPointerDown={(e) => beginEndDrag(e, m.id, h.end)} />);
        })()}
        {endDrag && (() => {
          const m = L.messages.find((x) => x.id === endDrag.id);
          const tgt = part(endDrag.to);
          return m && tgt ? <g pointerEvents="none"><line className="seq-drop" x1={tgt.x} x2={tgt.x} y1={tgt.lifeTop} y2={tgt.lifeBottom} /><line className="seq-drop" x1={endDrag.end === 'to' ? m.x1 : tgt.x} x2={endDrag.end === 'to' ? tgt.x : m.x2} y1={m.y} y2={m.y} /></g> : null;
        })()}
        {drag?.t === 'part' && <line className="seq-drop" x1={drag.pos} x2={drag.pos} y1={SEQ.titleH} y2={L.height - 8} />}
        {drag?.t === 'item' && <line className="seq-drop" x1={8} x2={L.width - 8} y1={drag.pos} y2={drag.pos} />}
      </svg>

      {edit?.t === 'title' && <SeqInput key="title" value={d.label} label="Sequence title" style={{ left: 28, top: 2, width: 200, height: 24 }} onCommit={(v) => v.trim() && edit_((x) => ({ ...x, label: v.trim() }))} onDone={() => setEdit(null)} />}
      {edit?.t === 'part' && (() => { const p = part(edit.id); return p ? (
        <SeqInput key={`p-${p.id}`} value={p.name} label="Participant name" style={{ ...labelStyle(p.x, isGlyph(p.kind) ? p.boxTop + SEQ.glyphH + 1 : p.boxTop + 8, Math.max(100, p.boxW)), height: 24 }} onTab={tabFrom(p.id)}
          onCommit={(v) => v.trim() && edit_((x) => updateParticipant(x, p.id, { name: v.trim() }) as SequenceData)} onDone={() => setEdit(null)} />
      ) : null; })()}
      {edit?.t === 'msg' && (() => { const m = L.messages.find((x) => x.id === edit.id); return m ? (
        <SeqInput key={`m-${m.id}`} value={m.text} label="Message text" style={{ ...labelStyle(m.self ? m.labelX + 60 : m.labelX, m.y - 26, Math.max(160, m.text.length * 7 + 30)), height: 24 }}
          onCommit={(v) => edit_((x) => updateItem(x, m.id, { text: v }) as SequenceData)} onDone={() => setEdit(null)} />
      ) : null; })()}
      {edit?.t === 'note' && (() => { const n = L.notes.find((x) => x.id === edit.id); return n ? (
        <SeqInput key={`n-${n.id}`} multiline value={n.text} label="Note text" style={{ left: n.x, top: n.y, width: n.w, height: Math.max(n.h, 44) }}
          onCommit={(v) => edit_((x) => updateItem(x, n.id, { text: v }) as SequenceData)} onDone={() => setEdit(null)} />
      ) : null; })()}
      {edit?.t === 'ref' && (() => { const r = L.refs.find((x) => x.id === edit.id); return r ? (
        <SeqInput key={`r-${r.id}`} multiline value={r.text} label="Ref text" style={{ left: r.x + 44, top: r.y + 2, width: Math.max(120, r.w - 48), height: Math.max(r.h - 4, 40) }}
          onCommit={(v) => edit_((x) => updateItem(x, r.id, { text: v }) as SequenceData)} onDone={() => setEdit(null)} />
      ) : null; })()}
      {edit?.t === 'box' && (() => { const b = L.boxes.find((x) => x.id === edit.id); return b ? (
        <SeqInput key={`b-${b.id}`} value={b.label} label="Box label" style={{ left: b.x + 4, top: b.y + 2, width: Math.max(80, b.w - 8), height: 22 }}
          onCommit={(v) => edit_((x) => updateBox(x, b.id, { label: v.trim() }) as SequenceData)} onDone={() => setEdit(null)} />
      ) : null; })()}
      {edit?.t === 'guard' && (() => {
        const f = L.fragments.find((fr) => fr.sections.some((s) => s.id === edit.id));
        const s = f?.sections.find((x) => x.id === edit.id);
        return f && s ? <SeqInput key={`g-${s.id}`} value={s.guard} label="Guard condition" style={{ left: f.x + 40, top: s.divider ? s.y + 1 : f.y + 2, width: 200, height: 22 }}
          onCommit={(v) => edit_((x) => updateSection(x, s.id, { guard: v }) as SequenceData)} onDone={() => setEdit(null)} /> : null;
      })()}
      {selected && !locked && sel?.t === 'frag' && (() => { const f = findItem(d, sel.id); return f && f.type === 'fragment' ? (
        <div className="seq-toolbar seq-toolbar-bottom nodrag nopan" role="toolbar" aria-label={t('Fragment tools')}>
          {f.op !== 'rect' && btn('Add else section', null, () => edit_((x) => addSection(x, f.id, f.op === 'par' ? '' : 'else') as SequenceData), f.op === 'par' ? '+ and' : f.op === 'critical' ? '+ option' : '+ else')}
          {btn('Delete fragment', <Trash2 size={13} aria-hidden />, () => { edit_((x) => removeItem(x, f.id) as SequenceData); setSel(null); })}
        </div>
      ) : null; })()}
    </div>
  );
}


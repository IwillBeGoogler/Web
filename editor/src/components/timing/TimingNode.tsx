import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent as RKeyboardEvent, type PointerEvent as RPointerEvent } from 'react';
import { useStore, type NodeProps } from '@xyflow/react';
import { ArrowLeftRight, Plus, Ruler, Trash2 } from 'lucide-react';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { addChangeAt, addConstraint, addLifeline, addMessage, moveChange, moveMessage, removeChange, removeConstraint, removeLifeline, removeMessage, renameLifeline, setStateAt, updateConstraint, updateMessage } from '../../lib/timing/edit';
import { layoutTiming, rowAt, tOf, TM, xOf, yAt, type LaidLifeline } from '../../lib/timing/layout';
import { timingOf } from '../../lib/timing/node';
import { LIFELINE_KINDS, LIFELINE_LABEL, type LifelineKind, type TimingData } from '../../lib/timing/types';
import '../../styles/uml2.css';
import { t } from '../../i18n';

type Sel = { t: 'life' | 'chg' | 'msg' | 'con'; id: string } | null;
type Field = { t: 'title' | 'life' | 'state' | 'msg' | 'con'; id: string };
/** a change being dragged: where it would land */
type Drag = { id: string; t: number; state?: string } | null;

/** tiny inline editor: Enter / blur commit, Escape cancels */
function TmInput({ value, style, label, onCommit, onDone }: { value: string; style: CSSProperties; label: string; onCommit: (v: string) => void; onDone: () => void }) {
  const [v, setV] = useState(value);
  const done = useRef(false);
  const finish = (commit: boolean) => {
    if (done.current) return;
    done.current = true;
    if (commit && v !== value) onCommit(v);
    onDone();
  };
  return (
    <input
      type="text" value={v} autoFocus className="nodrag nopan tm-input" style={style} aria-label={t(label)}
      onFocus={(e) => e.currentTarget.select()} onChange={(e) => setV(e.target.value)} onBlur={() => finish(true)}
      onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') finish(false); else if (e.key === 'Enter') { e.preventDefault(); finish(true); } }}
    />
  );
}

const fmt = (n: number) => String(Math.round(n * 100) / 100);

/** the polyline of a robust / binary lifeline: one level per state row, vertical steps at the changes */
function stepPath(l: LaidLifeline, L: { x0: number; end: number }): string {
  let d = '';
  l.segments.forEach((s, i) => {
    const y = l.rows.find((r) => r.state === s.state)?.y ?? l.y + l.h / 2;
    d += i === 0 ? `M${xOf(L, s.t0)} ${y}` : `V${y}`;
    d += `H${xOf(L, s.t1)}`;
  });
  return d;
}
function clockPath(l: LaidLifeline, L: { x0: number; end: number }): string {
  const hi = l.y + 9, lo = l.y + l.h - 9, half = (l.period ?? 1) / 2;
  let d = `M${xOf(L, 0)} ${hi}`;
  let high = true;
  for (let k = 1; k * half < L.end + half && k < 600; k++) {
    const x = xOf(L, Math.min(L.end, k * half));
    d += `H${x}`;
    if (k * half >= L.end) break;
    high = !high;
    d += `V${high ? hi : lo}`;
  }
  return d;
}

export function TimingNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const d = timingOf({ data } as DiagramNode);
  const locked = !!data.locked;
  const update = useDiagramStore((s) => s.updateTiming);
  const zoom = useStore((s) => s.transform[2]);
  const L = layoutTiming(d);
  const svgRef = useRef<SVGSVGElement>(null);
  const armed = useRef(false);
  const [sel, setSel] = useState<Sel>(null);
  const [edit, setEdit] = useState<Field | null>(null);
  const [drag, setDrag] = useState<Drag>(null);
  useEffect(() => { if (!selected) { setSel(null); setEdit(null); } }, [selected]);
  const renaming = useUiStore((s) => s.editingId === id);
  useEffect(() => {
    if (renaming) { setEdit({ t: 'title', id }); useUiStore.getState().setEditing(null); }
  }, [renaming, id]);
  const edit_ = (fn: (x: TimingData) => TimingData) => update(id, fn);
  const life = (lid: string) => L.lifelines.find((l) => l.id === lid);

  const toLocal = (clientX: number, clientY: number) => {
    const r = svgRef.current?.getBoundingClientRect();
    const s = r && L.width ? r.width / L.width : zoom || 1;
    return { x: r ? (clientX - r.left) / s : 0, y: r ? (clientY - r.top) / s : 0 };
  };

  /** drag a state change sideways to retime it (and, on robust / binary lifelines, up or down to another state); under 4px it is a click */
  const beginChangeDrag = (e: RPointerEvent, changeId: string, lifeId: string) => {
    e.stopPropagation();
    setSel({ t: 'chg', id: changeId });
    if (locked || e.button !== 0) return;
    const sx = e.clientX, sy = e.clientY;
    const lane = life(lifeId);
    let moved = false, to: Drag = null;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 4) return;
      moved = true;
      const p = toLocal(ev.clientX, ev.clientY);
      const tt = Math.max(0, Math.min(L.end, tOf(L, p.x)));
      to = { id: changeId, t: tt, state: lane && lane.rows.length ? rowAt(lane, p.y) : undefined };
      setDrag(to);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (moved && to) edit_((x) => moveChange(x, changeId, to!.t, to!.state));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };
  /** drag a message sideways in time */
  const beginMsgDrag = (e: RPointerEvent, msgId: string) => {
    e.stopPropagation();
    setSel({ t: 'msg', id: msgId });
    if (locked || e.button !== 0) return;
    const sx = e.clientX;
    const m = d.messages.find((x) => x.id === msgId);
    if (!m) return;
    const t0 = m.t, x0 = toLocal(sx, 0).x;
    let moved = false, to = m.t;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientX - sx) < 4) return;
      moved = true;
      to = t0 + tOf(L, toLocal(ev.clientX, 0).x) - tOf(L, x0);
      setDrag({ id: msgId, t: to });
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (moved) edit_((x) => moveMessage(x, msgId, Math.max(0, to)));
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const remove = () => {
    if (!sel) return;
    edit_((x) => (sel.t === 'life' ? removeLifeline(x, sel.id) : sel.t === 'chg' ? removeChange(x, sel.id) : sel.t === 'msg' ? removeMessage(x, sel.id) : removeConstraint(x, sel.id)));
    setSel(null);
  };
  const onKey = (e: RKeyboardEvent) => {
    if (edit || !selected || locked || !sel) return;
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); e.stopPropagation(); remove(); }
    else if (e.key === 'Enter') {
      e.preventDefault(); e.stopPropagation();
      setEdit({ t: sel.t === 'life' ? 'life' : sel.t === 'chg' ? 'state' : sel.t, id: sel.id });
    }
  };

  const btn = (label: string, icon: React.ReactNode, fn: () => void, text?: string) => (
    <button type="button" className="tm-btn nodrag" aria-label={t(label)} title={t(label)} onClick={fn} disabled={locked}>{icon}{text ? <span>{t(text)}</span> : null}</button>
  );
  const ghostX = drag ? xOf(L, Math.max(0, Math.min(L.end, drag.t))) : 0;

  return (
    <div className={`tm${selected ? ' selected' : ''}`} style={{ width: L.width, height: L.height, ['--tm-accent' as string]: d.accent }} tabIndex={-1} onKeyDown={onKey} data-testid={`timing-${id}`}>
      {selected && !locked && (
        <div className="tm-toolbar nodrag nopan" role="toolbar" aria-label={t('Timing tools')}>
          <select className="tm-select nodrag" aria-label={t('Add lifeline')} value="" onChange={(e) => { const k = e.target.value as LifelineKind; if (k) { edit_((x) => addLifeline(x, k)); e.target.value = ''; } }}>
            <option value="">{t('+ Lifeline…')}</option>
            {LIFELINE_KINDS.map((k) => <option key={k} value={k}>{t(LIFELINE_LABEL[k])}</option>)}
          </select>
          {btn('Add message between lifelines', <ArrowLeftRight size={13} aria-hidden />, () => {
            const from = sel?.t === 'life' ? sel.id : undefined;
            let made: string | undefined;
            edit_((x) => { const r = addMessage(x, from, from ? x.lifelines.find((l) => l.id !== from)?.id : undefined); made = r.id; return r.data; });
            if (made) { setSel({ t: 'msg', id: made }); setEdit({ t: 'msg', id: made }); }
          }, 'Message')}
          {btn('Add duration constraint', <Ruler size={13} aria-hidden />, () => {
            let made: string | undefined;
            edit_((x) => { const r = addConstraint(x, sel?.t === 'life' ? sel.id : undefined); made = r.id; return r.data; });
            if (made) { setSel({ t: 'con', id: made }); setEdit({ t: 'con', id: made }); }
          }, 'Constraint')}
          {sel?.t === 'life' && btn('Add state change at the middle', <Plus size={13} aria-hidden />, () => edit_((x) => { const r = addChangeAt(x, sel.id, x.end / 2); if (r.changeId) setSel({ t: 'chg', id: r.changeId }); return r.data; }), 'Change')}
          {sel && btn('Delete selected', <Trash2 size={13} aria-hidden />, remove)}
        </div>
      )}
      <svg ref={svgRef} width={L.width} height={L.height} className="tm-svg" role="group" aria-label={t('Timing diagram {name}', { name: d.label })} onPointerDown={() => setSel(null)}>
        <rect className="tm-frame" x={0.75} y={0.75} width={L.width - 1.5} height={L.height - 1.5} rx={6} />
        <g className="nodrag" onDoubleClick={() => !locked && setEdit({ t: 'title', id })}>
          <path className="tm-tab" d={`M0.75 0.75H${Math.max(60, d.label.length * 7 + 36)}V${TM.title - 6}L${Math.max(60, d.label.length * 7 + 36) - 8} ${TM.title + 2}H0.75Z`} />
          <text className="tm-tab-text" x={10} y={19}>td {d.label}</text>
        </g>

        {L.ticks.map((k) => <line key={`g${k.t}`} className="tm-grid" x1={k.x} x2={k.x} y1={TM.pad + TM.title} y2={L.axisY} />)}

        {L.lifelines.map((l) => {
          const isSel = sel?.t === 'life' && sel.id === l.id;
          return (
            <g key={l.id} className="tm-row">
              <rect className="tm-band" x={TM.pad} y={l.y} width={L.x1 - TM.pad} height={l.h} rx={3} />
              {l.rows.map((r) => (
                <g key={r.state}>
                  <line className="tm-guide" x1={L.x0} x2={L.x1} y1={r.y} y2={r.y} />
                  <text className="tm-state-name" x={L.x0 - 6} y={r.y + 3.5} textAnchor="end">{r.state}</text>
                </g>
              ))}
              {l.kind === 'robust' || l.kind === 'binary' ? <path className="tm-signal" d={stepPath(l, L)} /> : null}
              {l.kind === 'clock' ? <path className="tm-signal" d={clockPath(l, L)} /> : null}
              {l.kind === 'concise' ? l.segments.map((s) => {
                const xs = xOf(L, s.t0), xe = xOf(L, s.t1), top = l.y + 8, bot = l.y + l.h - 8, mid = l.y + l.h / 2;
                const w = xe - xs;
                if (w < 2) return null;
                return (
                  <g key={s.changeId}>
                    <path className="tm-hex" d={`M${xs} ${mid}L${xs + Math.min(5, w / 3)} ${top}H${xe - Math.min(5, w / 3)}L${xe} ${mid}L${xe - Math.min(5, w / 3)} ${bot}H${xs + Math.min(5, w / 3)}Z`} />
                    {w > s.state.length * 6.4 + 14 && <text className="tm-hex-text" x={(xs + xe) / 2} y={mid + 4} textAnchor="middle">{s.state}</text>}
                  </g>
                );
              }) : null}
              {l.kind !== 'clock' && (
                <rect className="tm-track nodrag" data-testid={`tm-track-${l.id}`} x={L.x0} y={l.y} width={L.x1 - L.x0} height={l.h} fill="transparent"
                  onPointerDown={() => { armed.current = !!selected; }}
                  onClick={(e) => {
                    if (!armed.current || locked) return;
                    armed.current = false;
                    const p = toLocal(e.clientX, e.clientY);
                    let made: string | undefined;
                    edit_((x) => { const r = addChangeAt(x, l.id, tOf(L, p.x), l.rows.length ? rowAt(l, p.y) : undefined); made = r.changeId; return r.data; });
                    if (made) { setSel({ t: 'chg', id: made }); if (l.kind === 'concise') setEdit({ t: 'state', id: made }); }
                  }} />
              )}
              <g className={`tm-life nodrag${isSel ? ' sel' : ''}`} tabIndex={0} role="button" aria-label={`${t('Lifeline {name}', { name: l.name.length > 14 ? `${l.name.slice(0, 13)}…` : l.name })} ${l.kind}`}
                onPointerDown={(e) => { e.stopPropagation(); setSel({ t: 'life', id: l.id }); }} onDoubleClick={() => !locked && setEdit({ t: 'life', id: l.id })}
                onFocus={() => selected && setSel({ t: 'life', id: l.id })}>
                <rect className="tm-life-hit" x={TM.pad + 4} y={l.y + 4} width={Math.max(40, Math.min(TM.labelW - 44, l.name.length * 7.2 + 12))} height={22} rx={4} />
                <text className="tm-life-name" x={TM.pad + 10} y={l.y + 19}>{l.name.length > 14 ? `${l.name.slice(0, 13)}…` : l.name}</text>
              </g>
              <text className="tm-life-kind" x={TM.pad + 10} y={l.y + 33} pointerEvents="none">{l.kind}</text>
            </g>
          );
        })}

        {d.durations.map((c) => {
          const l = life(c.life);
          if (!l) return null;
          const y = l.y + l.h - 2, x1 = xOf(L, c.t1), x2 = xOf(L, c.t2);
          const isSel = sel?.t === 'con' && sel.id === c.id;
          return (
            <g key={c.id} className={`tm-con nodrag${isSel ? ' sel' : ''}`} onPointerDown={(e) => { e.stopPropagation(); setSel({ t: 'con', id: c.id }); }} onDoubleClick={() => !locked && setEdit({ t: 'con', id: c.id })}>
              <path className="tm-hit" d={`M${x1} ${y}H${x2}`} />
              <path className="tm-con-line" d={`M${x1} ${y - 5}V${y + 5}M${x2} ${y - 5}V${y + 5}M${x1} ${y}H${x2}M${x1 + 7} ${y - 3.5}L${x1} ${y}L${x1 + 7} ${y + 3.5}M${x2 - 7} ${y - 3.5}L${x2} ${y}L${x2 - 7} ${y + 3.5}`} />
              <text className="tm-label" x={(x1 + x2) / 2} y={y - 6} textAnchor="middle">{c.text}</text>
            </g>
          );
        })}

        {d.messages.map((m) => {
          const t1 = drag?.id === m.id ? drag.t : m.t;
          const t2 = m.t2 !== undefined ? t1 + (m.t2 - m.t) : t1;
          const x1 = xOf(L, t1), x2 = xOf(L, t2);
          const y1 = yAt(L, d, m.from, m.t), y2 = yAt(L, d, m.to, m.t2 ?? m.t);
          const ang = Math.atan2(y2 - y1, x2 - x1 || 0.001);
          const hx = (a: number) => `${x2 - 9 * Math.cos(ang + a)},${y2 - 9 * Math.sin(ang + a)}`;
          const isSel = sel?.t === 'msg' && sel.id === m.id;
          return (
            <g key={m.id} className={`tm-msg nodrag${isSel ? ' sel' : ''}${drag?.id === m.id ? ' dragging' : ''}`} onPointerDown={(e) => beginMsgDrag(e, m.id)} onDoubleClick={() => !locked && setEdit({ t: 'msg', id: m.id })}>
              <path className="tm-hit" d={`M${x1} ${y1}L${x2} ${y2}`} />
              <path className="tm-msg-line" d={`M${x1} ${y1}L${x2} ${y2}`} />
              <polygon className="tm-head" points={`${x2},${y2} ${hx(0.4)} ${hx(-0.4)}`} />
              <text className="tm-label" x={(x1 + x2) / 2 + 4} y={(y1 + y2) / 2 - 5}>{m.text}</text>
            </g>
          );
        })}

        {d.changes.map((c) => {
          const l = life(c.life);
          if (!l || l.kind === 'clock') return null;
          const x = xOf(L, drag?.id === c.id ? drag.t : c.t);
          const row = l.rows.find((r) => r.state === c.state);
          const y = row ? row.y : l.y + l.h / 2;
          const isSel = sel?.t === 'chg' && sel.id === c.id;
          return (
            <g key={c.id} className={`tm-chg nodrag${isSel ? ' sel' : ''}${drag?.id === c.id ? ' dragging' : ''}`} data-testid={`tm-chg-${c.id}`} onPointerDown={(e) => beginChangeDrag(e, c.id, c.life)} onDoubleClick={() => !locked && setEdit({ t: 'state', id: c.id })}>
              <title>{`${c.state} @ ${fmt(c.t)}${d.unit}`}</title>
              <circle className="tm-chg-hit" cx={x} cy={y} r={9} />
              <circle className="tm-chg-dot" cx={x} cy={y} r={isSel ? 4.5 : 3.2} />
            </g>
          );
        })}
        {drag && <line className="tm-drop" x1={ghostX} x2={ghostX} y1={TM.pad + TM.title} y2={L.axisY} />}

        <line className="tm-axis" x1={L.x0} x2={L.x1} y1={L.axisY} y2={L.axisY} />
        {L.ticks.map((k) => (
          <g key={`a${k.t}`}>
            <line className="tm-tick" x1={k.x} x2={k.x} y1={L.axisY} y2={L.axisY + 5} />
            <text className="tm-tick-text" x={k.x} y={L.axisY + 18} textAnchor="middle">{fmt(k.t)}</text>
          </g>
        ))}
        {d.unit && <text className="tm-tick-text" x={L.x1 + 8} y={L.axisY + 18}>{d.unit}</text>}
      </svg>

      {edit?.t === 'title' && <TmInput key="title" value={d.label} label="Timing title" style={{ left: 28, top: 2, width: 200, height: 24 }} onCommit={(v) => v.trim() && edit_((x) => ({ ...x, label: v.trim() }))} onDone={() => setEdit(null)} />}
      {edit?.t === 'life' && (() => { const l = life(edit.id); return l ? <TmInput key={`l-${l.id}`} value={l.name} label="Lifeline name" style={{ left: TM.pad + 4, top: l.y + 3, width: TM.labelW - 24, height: 24 }} onCommit={(v) => v.trim() && edit_((x) => renameLifeline(x, l.id, v.trim()))} onDone={() => setEdit(null)} /> : null; })()}
      {edit?.t === 'state' && (() => {
        const c = d.changes.find((x) => x.id === edit.id);
        const l = c && life(c.life);
        return c && l ? <TmInput key={`s-${c.id}`} value={c.state} label="State name" style={{ left: xOf(L, c.t) + 6, top: l.y + l.h / 2 - 12, width: 110, height: 24 }} onCommit={(v) => v.trim() && edit_((x) => setStateAt(x, c.life, c.t, v.trim()))} onDone={() => setEdit(null)} /> : null;
      })()}
      {edit?.t === 'msg' && (() => {
        const m = d.messages.find((x) => x.id === edit.id);
        return m ? <TmInput key={`m-${m.id}`} value={m.text} label="Message text" style={{ left: xOf(L, m.t) + 6, top: (yAt(L, d, m.from, m.t) + yAt(L, d, m.to, m.t2 ?? m.t)) / 2 - 12, width: 150, height: 24 }} onCommit={(v) => edit_((x) => updateMessage(x, m.id, { text: v }))} onDone={() => setEdit(null)} /> : null;
      })()}
      {edit?.t === 'con' && (() => {
        const c = d.durations.find((x) => x.id === edit.id);
        const l = c && life(c.life);
        return c && l ? <TmInput key={`k-${c.id}`} value={c.text} label="Constraint text" style={{ left: (xOf(L, c.t1) + xOf(L, c.t2)) / 2 - 60, top: l.y + l.h - 30, width: 120, height: 24 }} onCommit={(v) => edit_((x) => updateConstraint(x, c.id, { text: v }))} onDone={() => setEdit(null)} /> : null;
      })()}
    </div>
  );
}

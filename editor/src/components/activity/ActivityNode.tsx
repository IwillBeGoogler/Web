import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { BufferedInput } from '../BufferedInput';
import { isPseudo, type ActivityData } from '../../lib/activity/types';
import '../../styles/uml2.css';
import { t } from '../../i18n';

const SIDES: [string, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];
const NAMES: Record<string, string> = { action: 'Action', decision: 'Condition', object: 'Object', send: 'Signal', accept: 'Event', note: 'Note' };

/** Activity diagram element: initial / final / flow final, action, decision / merge diamond, fork / join bar, object, send / accept signal, note. */
export function ActivityNode({ id, data, selected, width, height }: NodeProps<DiagramNode>) {
  const d = data as unknown as ActivityData;
  const update = useDiagramStore((s) => s.updateShape);
  const editing = useUiStore((s) => s.editingId === id);
  const setEditing = useUiStore((s) => s.setEditing);
  const locked = !!data.locked;
  const w = width ?? 120, h = height ?? 48;
  const k = d.actKind;
  const multiline = k === 'action' || k === 'note';
  const label = editing && !isPseudo(k) ? (
    <BufferedInput autoFocus multiline={multiline} value={d.label} className="nodrag inline-edit" aria-label={t('{name} text', { name: t(NAMES[k] ?? 'Label') })} onCommit={(v) => update(id, (x) => ({ ...x, label: v.trim() ? v.trim() : x.label }))} onDone={() => setEditing(null)} />
  ) : d.label;
  const svg = (() => {
    switch (k) {
      case 'initial': return <circle className="act-fill" cx={w / 2} cy={h / 2} r={w / 2 - 1} />;
      case 'final': return <><circle className="act-ring" cx={w / 2} cy={h / 2} r={w / 2 - 1.5} /><circle className="act-fill" cx={w / 2} cy={h / 2} r={w / 2 - 7} /></>;
      case 'flowFinal': return <><circle className="act-ring" cx={w / 2} cy={h / 2} r={w / 2 - 1.5} /><path className="act-cross" d={`M${w * 0.28} ${h * 0.28}L${w * 0.72} ${h * 0.72}M${w * 0.72} ${h * 0.28}L${w * 0.28} ${h * 0.72}`} /></>;
      case 'decision': return <polygon className="act-shape" points={`${w / 2},1.5 ${w - 1.5},${h / 2} ${w / 2},${h - 1.5} 1.5,${h / 2}`} />;
      case 'fork': return <rect className="act-fill" x={0} y={0} width={w} height={h} rx={2} />;
      case 'object': return <rect className="act-shape" x={1} y={1} width={w - 2} height={h - 2} />;
      case 'send': return <polygon className="act-shape" points={`1,1 ${w - 16},1 ${w - 1},${h / 2} ${w - 16},${h - 1} 1,${h - 1}`} />;
      case 'accept': return <polygon className="act-shape" points={`1,1 ${w - 1},1 ${w - 1},${h - 1} 1,${h - 1} 16,${h / 2}`} />;
      case 'note': return <path className="act-note" d={`M1 1H${w - 14}L${w - 1} 14V${h - 1}H1Z M${w - 14} 1V14H${w - 1}`} />;
      default: return <rect className="act-shape" x={1} y={1} width={w - 2} height={h - 2} rx={Math.min(18, h / 2)} />;
    }
  })();
  return (
    <div className={`act act-${k}${selected ? ' selected' : ''}`} style={{ ['--act-accent' as string]: d.accent }} data-testid={`activity-${id}`} onDoubleClick={() => !locked && !isPseudo(k) && setEditing(id)}>
      <svg className="act-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">{svg}</svg>
      {!isPseudo(k) && k !== 'decision' && (
        <div className={`act-label${k === 'note' ? ' note' : ''}`}>
          {label}
          {k === 'object' && d.objectState ? <div className="act-state">[{d.objectState}]</div> : null}
        </div>
      )}
      {k === 'decision' && (editing || d.label) && <div className="act-cond">{label}</div>}
      {SIDES.map(([hid, pos]) => <Handle key={hid} id={hid} type="source" position={pos} className="handle" />)}
    </div>
  );
}

import { useState } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { BufferedInput } from '../BufferedInput';
import { stateOf } from '../../lib/state/convert';
import '../../styles/uml2.css';
import { t } from '../../i18n';

const SIDES: [string, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];

/** UML state: rounded box with optional internal activities, plus the pseudo states (initial, final, choice, fork, join, history). */
export function StateNode({ id, data, selected, width, height }: NodeProps<DiagramNode>) {
  const d = stateOf({ data } as DiagramNode);
  const update = useDiagramStore((s) => s.updateState);
  const editing = useUiStore((s) => s.editingId === id);
  const setEditing = useUiStore((s) => s.setEditing);
  const [editAct, setEditAct] = useState(false);
  const locked = !!data.locked;
  const w = width ?? 110, h = height ?? 40;
  const handles = SIDES.map(([hid, pos]) => <Handle key={hid} id={hid} type="source" position={pos} className="handle" />);
  const cls = `st${selected ? ' selected' : ''}`;
  const vars = { ['--st-accent' as string]: d.accent };

  switch (d.stateKind) {
    case 'initial':
      return <div className={cls} style={vars} data-testid={`state-${id}`}><svg className="st-svg" viewBox={`0 0 ${w} ${h}`}><circle className="st-fill" cx={w / 2} cy={h / 2} r={w / 2 - 1} /></svg>{handles}</div>;
    case 'final':
      return <div className={cls} style={vars} data-testid={`state-${id}`}><svg className="st-svg" viewBox={`0 0 ${w} ${h}`}><circle className="st-ring" cx={w / 2} cy={h / 2} r={w / 2 - 1.5} /><circle className="st-fill" cx={w / 2} cy={h / 2} r={w / 2 - 6} /></svg>{handles}</div>;
    case 'choice':
      return <div className={cls} style={vars} data-testid={`state-${id}`}><svg className="st-svg" viewBox={`0 0 ${w} ${h}`}><polygon className="st-diamond" points={`${w / 2},1.5 ${w - 1.5},${h / 2} ${w / 2},${h - 1.5} 1.5,${h / 2}`} /></svg>{handles}</div>;
    case 'fork':
    case 'join':
      return <div className={cls} style={vars} data-testid={`state-${id}`}><svg className="st-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none"><rect className="st-fill" x={0} y={0} width={w} height={h} rx={2} /></svg>{handles}</div>;
    case 'entryPoint':
    case 'exitPoint':
      return (
        <div className={cls} style={vars} data-testid={`state-${id}`}>
          <svg className="st-svg" viewBox={`0 0 ${w} ${h}`}>
            <circle className="st-ring" cx={w / 2} cy={h / 2} r={w / 2 - 1.5} />
            {d.stateKind === 'exitPoint' && <path className="st-cross" d={`M${w * 0.28} ${h * 0.28}L${w * 0.72} ${h * 0.72}M${w * 0.72} ${h * 0.28}L${w * 0.28} ${h * 0.72}`} />}
          </svg>
          {handles}
        </div>
      );
    case 'history':
    case 'deepHistory':
      return (
        <div className={cls} style={vars} data-testid={`state-${id}`}>
          <svg className="st-svg" viewBox={`0 0 ${w} ${h}`}><circle className="st-ring" cx={w / 2} cy={h / 2} r={w / 2 - 1.5} /><text className="st-hist-text" x={w / 2} y={h / 2 + 4.3} textAnchor="middle">{d.stateKind === 'deepHistory' ? 'H*' : 'H'}</text></svg>
          {handles}
        </div>
      );
    default: {
      const lines = d.activity ? d.activity.split('\n').filter(Boolean) : [];
      return (
        <div className={cls} style={vars} data-testid={`state-${id}`}>
          <div className="st-box">
            <div className="st-name" onDoubleClick={() => !locked && setEditing(id)}>
              {editing ? (
                <BufferedInput autoFocus value={d.label} className="nodrag inline-edit" aria-label={t('State name')} onCommit={(label) => label.trim() && update(id, (x) => ({ ...x, label: label.trim() }))} onDone={() => setEditing(null)} />
              ) : (
                d.label
              )}
            </div>
            {(lines.length > 0 || editAct) && (
              <div className="st-act" onDoubleClick={() => !locked && setEditAct(true)}>
                {editAct ? (
                  <BufferedInput multiline autoFocus value={d.activity ?? ''} className="nodrag st-input" aria-label={t('State activities')} onCommit={(v) => update(id, (x) => ({ ...x, activity: v.trim() || undefined }))} onDone={() => setEditAct(false)} />
                ) : (
                  lines.join('\n')
                )}
              </div>
            )}
          </div>
          {handles}
        </div>
      );
    }
  }
}

import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { BufferedInput } from '../BufferedInput';
import type { UseCaseData } from '../../lib/uml2/types';
import '../../styles/uml2.css';
import { t } from '../../i18n';

const SIDES: [string, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];

/** Use case diagram element: UML actor (stick figure with its name below) or use case (ellipse). */
export function UseCaseNode({ id, data, selected, width, height }: NodeProps<DiagramNode>) {
  const d = data as unknown as UseCaseData;
  const update = useDiagramStore((s) => s.updateShape);
  const editing = useUiStore((s) => s.editingId === id);
  const setEditing = useUiStore((s) => s.setEditing);
  const locked = !!data.locked;
  const w = width ?? 150, h = height ?? 64;
  const actor = d.ucKind === 'actor';
  const cx = w / 2;
  const eps = actor ? [] : d.extensionPoints ?? [];
  // the name sits in the upper part of the ellipse, the extension points under a chord
  const nameH = eps.length ? h - (22 + eps.length * 15) : h;
  const dy = (nameH - h / 2) / (h / 2 - 1);
  const half = Math.sqrt(Math.max(0, 1 - dy * dy)) * (w / 2 - 1);
  const label = editing ? (
    <BufferedInput autoFocus value={d.label} className="nodrag inline-edit" aria-label={actor ? t('Actor name') : t('Use case name')} onCommit={(v) => v.trim() && update(id, (x) => ({ ...x, label: v.trim() }))} onDone={() => setEditing(null)} />
  ) : d.label;
  return (
    <div className={`uc${selected ? ' selected' : ''}`} style={{ ['--uc-accent' as string]: d.accent }} data-testid={`usecase-${id}`} onDoubleClick={() => !locked && setEditing(id)}>
      <svg className="uc-svg" viewBox={`0 0 ${w} ${h}`}>
        {actor ? (
          <g className="uc-fig">
            <circle className="head" cx={cx} cy={13} r={10} />
            <path d={`M${cx} 23V56M${cx - 19} 35H${cx + 19}M${cx} 56L${cx - 15} 76M${cx} 56L${cx + 15} 76`} />
          </g>
        ) : (
          <>
            <ellipse className="uc-ellipse" cx={cx} cy={h / 2} rx={w / 2 - 1} ry={h / 2 - 1} />
            {eps.length > 0 && <path className="uc-chord" d={`M${cx - half} ${nameH}H${cx + half}`} />}
          </>
        )}
      </svg>
      <div className={`uc-label ${actor ? 'actor' : 'ellipse'}`} style={eps.length ? { bottom: h - nameH } : undefined}>{label}</div>
      {eps.length > 0 && (
        <div className="uc-eps" style={{ top: nameH + 3 }} data-testid={`usecase-eps-${id}`}>
          <div className="uc-eps-title">{t('extension points')}</div>
          {eps.map((e, i) => <div key={i}>{e}</div>)}
        </div>
      )}
      {SIDES.map(([hid, pos]) => <Handle key={hid} id={hid} type="source" position={pos} className="handle" />)}
    </div>
  );
}

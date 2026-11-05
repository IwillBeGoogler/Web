import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { BufferedInput } from '../BufferedInput';
import { IconGlyph } from '../IconGlyph';
import type { DeploymentData } from '../../lib/deployment/types';
import '../../styles/uml2.css';
import { t } from '../../i18n';

const SIDES: [string, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];
const STEREO: Record<string, string> = { device: '«device»', executionEnvironment: '«execution environment»', artifact: '«artifact»', component: '«component»' };
const D = 14;

/** Deployment diagram element: node / device / execution environment (3D boxes that can hold other elements), artifact and component. */
export function DeploymentNode({ id, data, selected, width, height }: NodeProps<DiagramNode>) {
  const d = data as unknown as DeploymentData;
  const update = useDiagramStore((s) => s.updateShape);
  const editing = useUiStore((s) => s.editingId === id);
  const setEditing = useUiStore((s) => s.setEditing);
  const locked = !!data.locked;
  const w = width ?? 160, h = height ?? 96;
  const k = d.depKind;
  const box = k === 'node' || k === 'device' || k === 'executionEnvironment';
  const name = editing ? (
    <BufferedInput autoFocus value={d.label} className="nodrag inline-edit" aria-label={t('Name')} onCommit={(v) => v.trim() && update(id, (x) => ({ ...x, label: v.trim() }))} onDone={() => setEditing(null)} />
  ) : d.label;
  const shape = box ? (
    <g>
      <rect className="dp-shape" x={1} y={D} width={w - D - 1} height={h - D - 1} rx={k === 'executionEnvironment' ? 10 : 2} />
      <polygon className="dp-side" points={`1,${D} ${D + 1},1 ${w - 1},1 ${w - D},${D}`} />
      <polygon className="dp-side" points={`${w - D - 1},${D} ${w - 1},1 ${w - 1},${h - D - 1} ${w - D - 1},${h - 1}`} />
      {k === 'device' && <path className="dp-line" d={`M${w * 0.3} ${h - 8}H${(w - D) * 0.7}`} />}
    </g>
  ) : k === 'artifact' ? (
    <g>
      <path className="dp-shape" d={`M1 1H${w - 16}L${w - 1} 16V${h - 1}H1Z`} />
      <path className="dp-line" d={`M${w - 16} 1V16H${w - 1}`} />
    </g>
  ) : (
    <g>
      <rect className="dp-shape" x={1} y={1} width={w - 2} height={h - 2} rx={3} />
      <g transform={`translate(${w - 28} 8)`}>
        <rect className="dp-ball" x={4} y={0} width={16} height={11} />
        <rect className="dp-ball" x={0} y={2} width={8} height={3} />
        <rect className="dp-ball" x={0} y={6} width={8} height={3} />
      </g>
    </g>
  );
  const stereo = d.stereotype ? `«${d.stereotype}»` : STEREO[k];
  return (
    <div className={`dp${selected ? ' selected' : ''}`} style={{ ['--dp-accent' as string]: d.accent }} data-testid={`deployment-${id}`} onDoubleClick={() => !locked && setEditing(id)}>
      <svg className="dp-svg" viewBox={`0 0 ${w} ${h}`}>{shape}</svg>
      <div className={`dp-text${d.container ? ' container' : ''}${box ? ' box' : ''}`}>
        {stereo && <div className="dp-stereo">{stereo}</div>}
        <div className="dp-name">{name}</div>
      </div>
      {d.iconId && <div className="dp-icon"><IconGlyph iconId={d.iconId} size={24} /></div>}
      {SIDES.map(([hid, pos]) => <Handle key={hid} id={hid} type="source" position={pos} className="handle" />)}
    </div>
  );
}

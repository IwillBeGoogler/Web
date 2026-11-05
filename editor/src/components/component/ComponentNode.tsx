import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { BufferedInput } from '../BufferedInput';
import { CrossLinkBadge } from '../crosslink/CrossLinks';
import { portOffsetPoint, PORT_R } from '../../lib/component/ports';
import type { ComponentData } from '../../lib/uml2/types';
import '../../styles/uml2.css';
import { t } from '../../i18n';

const SIDES: [string, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];
const ROT = { right: 0, down: 90, left: 180, up: 270 } as const;
const STEREO: Record<string, string> = { component: '«component»', node: '«node»', artifact: '«artifact»' };

/** Component diagram element: component, deployment node, artifact, and the provided (lollipop) / required (socket) interfaces. */
export function ComponentNode({ id, data, selected, width, height }: NodeProps<DiagramNode>) {
  const d = data as unknown as ComponentData;
  const update = useDiagramStore((s) => s.updateShape);
  const editing = useUiStore((s) => s.editingId === id);
  const setEditing = useUiStore((s) => s.setEditing);
  const locked = !!data.locked;
  const w = width ?? 150, h = height ?? 72;
  const iface = d.compKind === 'provided' || d.compKind === 'required';
  const name = editing ? (
    <BufferedInput autoFocus value={d.label} className="nodrag inline-edit" aria-label={t('Name')} onCommit={(v) => v.trim() && update(id, (x) => ({ ...x, label: v.trim() }))} onDone={() => setEditing(null)} />
  ) : d.label;
  const ports = iface ? [] : d.ports ?? [];
  const handles = SIDES.map(([hid, pos]) => <Handle key={hid} id={hid} type="source" position={pos} className="handle" />);
  const sideRot = { right: 0, bottom: 90, left: 180, top: 270 } as const;
  const portEls = ports.length ? (
    <>
      <svg className="cp-ports" viewBox={`0 0 ${w} ${h}`} data-testid={`ports-${id}`}>
        {ports.map((p) => {
          const o = portOffsetPoint(w, h, p);
          return p.kind === 'provided' ? (
            <circle key={p.id} className="cp-ball" data-port={p.id} data-kind="provided" cx={o.x} cy={o.y} r={PORT_R} />
          ) : (
            <path key={p.id} className="cp-line" data-port={p.id} data-kind="required" transform={`rotate(${sideRot[p.side]} ${o.x} ${o.y})`} d={`M${o.x + 3} ${o.y - PORT_R - 2}A${PORT_R + 2} ${PORT_R + 2} 0 0 0 ${o.x + 3} ${o.y + PORT_R + 2}`} />
          );
        })}
      </svg>
      {ports.map((p) => {
        const o = portOffsetPoint(w, h, p);
        const style = p.side === 'left' ? { left: o.x + 10, top: o.y - 8 } : p.side === 'right' ? { right: w - o.x + 10, top: o.y - 8 } : p.side === 'top' ? { left: o.x + 8, top: 8 } : { left: o.x + 8, bottom: 8 };
        return <div key={p.id} className="cp-port-label" style={style}>{p.name}</div>;
      })}
      {ports.map((p) => {
        const o = portOffsetPoint(w, h, p);
        return <Handle key={p.id} id={p.id} type="source" position={SIDES.find(([k]) => k === p.side)![1]} className="handle port-handle" style={{ left: o.x, top: o.y }} />;
      })}
    </>
  ) : null;
  const vars = { ['--cp-accent' as string]: d.accent };
  const cls = `cp${selected ? ' selected' : ''}${ports.length ? ' has-ports' : ''}`;
  const dbl = () => !locked && setEditing(id);

  if (iface) {
    const c = w / 2;
    return (
      <div className={cls} style={vars} data-testid={`component-${id}`} onDoubleClick={dbl}>
        <svg className="cp-svg" viewBox={`0 0 ${w} ${h}`}>
          {d.compKind === 'provided' ? (
            <circle className="cp-ball" cx={c} cy={h / 2} r={Math.min(w, h) / 2 - 3} />
          ) : (
            <path className="cp-line" transform={`rotate(${ROT[d.facing ?? 'right']} ${c} ${h / 2})`} d={`M${c + 3} ${h / 2 - 11}A11 11 0 0 0 ${c + 3} ${h / 2 + 11}`} />
          )}
        </svg>
        <div className="cp-iface-label">{name}</div>
        <CrossLinkBadge id={id} data={data} />
        {handles}
      </div>
    );
  }
  const shape =
    d.compKind === 'node' ? (
      <g>
        <polygon className="cp-shape" points={`0,14 14,0 ${w},0 ${w},${h - 14} ${w - 14},${h} 0,${h}`} />
        <path className="cp-line" d={`M0 14H${w - 14}V${h}M${w - 14} 14L${w} 0`} />
      </g>
    ) : d.compKind === 'artifact' ? (
      <g>
        <path className="cp-shape" d={`M1 1H${w - 16}L${w - 1} 16V${h - 1}H1Z`} />
        <path className="cp-line" d={`M${w - 16} 1V16H${w - 1}`} />
      </g>
    ) : (
      <g>
        <rect className="cp-shape" x={1} y={1} width={w - 2} height={h - 2} rx={3} />
        <g transform={`translate(${w - 28} 8)`}>
          <rect className="cp-ball" x={4} y={0} width={16} height={11} />
          <rect className="cp-ball" x={0} y={2} width={8} height={3} />
          <rect className="cp-ball" x={0} y={6} width={8} height={3} />
        </g>
      </g>
    );
  return (
    <div className={cls} style={vars} data-testid={`component-${id}`} onDoubleClick={dbl}>
      <svg className="cp-svg" viewBox={`0 0 ${w} ${h}`}>{shape}</svg>
      <div className={`cp-text${d.container ? ' container' : ''}`} style={{ top: d.compKind === 'node' ? 10 : 0, ...(d.container ? {} : { bottom: 0 }) }}>
        <div className="cp-stereo">{d.stereotype ? `«${d.stereotype}»` : STEREO[d.compKind]}</div>
        <div className="cp-name">{name}</div>
      </div>
      <CrossLinkBadge id={id} data={data} />
      {portEls}
      {handles}
    </div>
  );
}

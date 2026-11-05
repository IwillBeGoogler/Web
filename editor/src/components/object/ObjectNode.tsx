import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { BufferedInput } from '../BufferedInput';
import { objectTitle, type ObjectData } from '../../lib/object/types';
import '../../styles/uml2.css';

const SIDES: [string, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];

/** Object diagram instance: an underlined `name : Class` title and one `attribute = value` row per slot. */
export function ObjectNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const d = data as unknown as ObjectData;
  const update = useDiagramStore((s) => s.updateShape);
  const editing = useUiStore((s) => s.editingId === id);
  const setEditing = useUiStore((s) => s.setEditing);
  const locked = !!data.locked;
  const title = editing ? (
    <BufferedInput autoFocus value={d.label} className="nodrag inline-edit" aria-label="Instance name" onCommit={(v) => v.trim() && update(id, (x) => ({ ...x, label: v.trim() }))} onDone={() => setEditing(null)} />
  ) : objectTitle(d);
  return (
    <div className={`ob${selected ? ' selected' : ''}`} style={{ ['--ob-accent' as string]: d.accent }} data-testid={`object-${id}`} onDoubleClick={() => !locked && setEditing(id)}>
      <div className="ob-head">{title}</div>
      {(d.slots ?? []).length > 0 && (
        <div className="ob-slots">
          {d.slots.map((s) => (
            <div key={s.id} className="ob-slot">{s.name}{s.value ? <><span className="ob-eq"> = </span>{s.value}</> : null}</div>
          ))}
        </div>
      )}
      {SIDES.map(([hid, pos]) => <Handle key={hid} id={hid} type="source" position={pos} className="handle" />)}
    </div>
  );
}

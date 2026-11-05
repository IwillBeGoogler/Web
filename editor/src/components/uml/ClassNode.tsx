import { Handle, Position, useStore, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, GripVertical, Link2, Plus, X } from 'lucide-react';
import type { DiagramNode } from '../../types';
import { useEffect, useMemo, useRef } from 'react';
import { useDiagramStore } from '../../store/diagramStore';
import { useDriftStore } from '../../lib/uml/driftStore';
import { useUiStore } from '../../store/uiStore';
import { BufferedInput } from '../BufferedInput';
import { CrossLinkBadge } from '../crosslink/CrossLinks';
import { copyCount } from '../../lib/uml/shared';
import { RowCard, type RowCardCompartment } from '../rows/RowCard';
import { useInlineEdit, useRowReorder } from '../rows/rowHooks';
import { CLS, classOf, headerLines, shownCompartments } from '../../lib/uml/geometry';
import { addMember, moveMember, parseName, removeMember, setMemberText, toggleCompartment, type Compartment } from '../../lib/uml/edit';
import { displayName, formatAttribute, formatOperation, memberText } from '../../lib/uml/member';
import type { ClassMember, ClassNodeData } from '../../lib/uml/types';
import { t } from '../../i18n';

const SIDES: [string, Position][] = [['top', Position.Top], ['right', Position.Right], ['bottom', Position.Bottom], ['left', Position.Left]];
const LABELS: Record<Compartment, [string, string]> = { attributes: ['attribute', 'attributes'], operations: ['operation', 'operations'] };

/** marks a copy of a shared class (name and members are the same on every copy); a lone copy is not flagged */
function SharedBadge({ id, modelId }: { id: string; modelId: string }) {
  const copies = useDiagramStore((s) => copyCount(s, modelId));
  if (copies < 2) return null;
  return <span className="uml-shared" title={t('Shared class: {n} linked copies. Rename or edit members on any of them.', { n: copies })} data-testid={`shared-${id}`}><Link2 size={10} aria-hidden /> {copies}</span>;
}

/** UML class / interface / abstract class / enum: name, attributes and operations as fixed-height rows (row engine). */
export function ClassNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const d = classOf({ data } as DiagramNode) as ClassNodeData;
  const update = useDiagramStore((s) => s.updateClass);
  const editingHeader = useUiStore((s) => s.editingId === id);
  const setEditing = useUiStore((s) => s.setEditing);
  const zoom = useStore((s) => s.transform[2]);
  const field = useInlineEdit<'text'>();
  const memberEdit = useUiStore((s) => (s.memberEdit?.nodeId === id ? s.memberEdit : null));
  // "Add attribute / operation" from the context menu: focus the new member for inline editing, like the + button
  useEffect(() => {
    if (!memberEdit) return;
    field.open(memberEdit.memberId, 'text');
    useUiStore.getState().setMemberEdit(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberEdit]);
  const driftState = useDriftStore((s) => s.drift);
  const dismissed = useDriftStore((s) => s.dismissed);
  // code ↔ UML review markers (only while a comparison is open)
  const marks = useMemo(() => (driftState ? useDriftStore.getState().marksFor(id) : null), [driftState, dismissed, id]);
  const locked = !!data.locked;
  const edit = (fn: (x: ClassNodeData) => ClassNodeData) => update(id, fn);
  const shown = shownCompartments(d);
  const isEnum = d.kind === 'enum';
  const abstractName = d.kind === 'abstract' || d.kind === 'interface';

  const reorderA = useRowReorder({ count: d.attributes.length, rowH: CLS.rowH, zoom, disabled: locked, onMove: (mid, to) => edit((x) => moveMember(x, 'attributes', mid, to)) });
  const reorderO = useRowReorder({ count: d.operations.length, rowH: CLS.rowH, zoom, disabled: locked, onMove: (mid, to) => edit((x) => moveMember(x, 'operations', mid, to)) });

  /** append a member and start editing it */
  const addAndEdit = (comp: Compartment) => {
    let newId = '';
    edit((x) => {
      const n = addMember(x, comp === 'attributes' ? 'attribute' : 'operation');
      newId = n[comp][n[comp].length - 1].id;
      return n;
    });
    if (newId) field.open(newId, 'text');
  };
  /** set by Enter (capture phase, before the input commits) so closing the field continues with a new member */
  const enterFrom = useRef<string | null>(null);

  const rowFor = (comp: Compartment, m: ClassMember, i: number) => {
    const reorder = comp === 'attributes' ? reorderA : reorderO;
    const text = comp === 'attributes' ? formatAttribute(m) : formatOperation(m);
    const shownText = (isEnum && comp === 'attributes' ? m.name : text.replace(/^[+\-#~]\s/, ''));
    const full = memberText(m, comp === 'attributes' ? 'attribute' : 'operation');
    return {
      id: m.id,
      className: `uml-row${reorder.rowClass(m.id, i)}${marks?.byMemberId.get(m.id) ? ` drift-${marks.byMemberId.get(m.id)}` : ''}`,
      children: (
        <>
          {!locked && (
            <span className="uml-grip nodrag" onPointerDown={(e) => reorder.start(e, m.id, i)} aria-hidden="true" title={t('Drag to reorder')}>
              <GripVertical size={11} aria-hidden />
            </span>
          )}
          {!isEnum && <span className="uml-vis" aria-label={m.visibility || t('none')}>{m.visibility}</span>}
          {field.is(m.id, 'text') ? (
            <span className="uml-edit-wrap" style={{ display: 'contents' }} onKeyDownCapture={(e) => { if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey && !e.altKey) enterFrom.current = m.id; }}>
              <BufferedInput
                autoFocus
                value={full}
                className="nodrag uml-input"
                aria-label={t('Edit {what}', { what: t(LABELS[comp][0]) })}
                onCommit={(v) => v.trim() && edit((x) => setMemberText(x, comp, m.id, v))}
                onDone={() => {
                  field.close();
                  if (enterFrom.current === m.id) { enterFrom.current = null; addAndEdit(comp); }
                }}
              />
            </span>
          ) : (
            <span
              className={`uml-text${m.static ? ' static' : ''}${m.abstract ? ' abstract' : ''}`}
              onDoubleClick={(e) => { e.stopPropagation(); if (!locked) field.open(m.id, 'text'); }}
              title={full}
            >
              {shownText}
            </span>
          )}
          {!locked && (
            <span className="uml-actions nodrag">
              <button type="button" aria-label={t('Delete member {what}', { what: t(LABELS[comp][0]) })} title={t('Delete')} onClick={() => edit((x) => removeMember(x, m.id))}><X size={10} aria-hidden /></button>
            </span>
          )}
        </>
      ),
    };
  };

  const compartment = (comp: Compartment): RowCardCompartment => {
    const list = comp === 'attributes' ? d.attributes : d.operations;
    const collapsed = (comp === 'attributes' ? d.collapsedAttributes : d.collapsedOperations) && list.length > 0;
    const [one, many] = LABELS[comp];
    const word = isEnum && comp === 'attributes' ? 'literal' : one;
    return {
      id: comp,
      className: 'uml-comp',
      style: { paddingTop: CLS.pad, paddingBottom: CLS.pad },
      rows: list.map((m, i) => rowFor(comp, m, i)),
      empty: <></>,
      summary: collapsed ? (
        <button type="button" className="uml-summary nodrag" style={{ height: CLS.summaryH }} aria-label={t('Expand {what}', { what: t(many) })} onClick={() => edit((x) => toggleCompartment(x, comp))}>
          <ChevronRight size={11} aria-hidden /> {list.length} {t(list.length === 1 ? word : `${word}s`)}
        </button>
      ) : undefined,
      after: (
        <>
          {list.length > 0 && !collapsed && (
            <button type="button" className="uml-comp-toggle nodrag" aria-label={t('Collapse {what}', { what: t(many) })} title={t('Collapse {what}', { what: t(many) })} onClick={() => edit((x) => toggleCompartment(x, comp))}>
              <ChevronDown size={11} aria-hidden />
            </button>
          )}
          {!locked && !collapsed && (
            <button type="button" className="uml-add nodrag" aria-label={t('Add {what}', { what: t(word) })} title={t('Add {what}', { what: t(word) })} onClick={() => addAndEdit(comp)}>
              <Plus size={11} aria-hidden />
            </button>
          )}
        </>
      ),
    };
  };

  const stereo = headerLines(d);
  const header = (
    <div className="uml-head" style={{ height: CLS.headerH + stereo.length * CLS.stereoH }}>
      {stereo.map((s) => <div key={s} className="uml-stereo">{s}</div>)}
      {editingHeader ? (
        <BufferedInput
          autoFocus
          value={displayName(d)}
          className="nodrag uml-input uml-title-input"
          aria-label={t('Class name')}
          onCommit={(v) => { const p = parseName(v); if (p.label) edit((x) => ({ ...x, label: p.label, generics: p.generics })); }}
          onDone={() => setEditing(null)}
        />
      ) : (
        <div className={`uml-title${abstractName && d.kind === 'abstract' ? ' abstract' : ''}${d.kind === 'interface' ? ' interface' : ''}`} onDoubleClick={() => !locked && setEditing(id)} title={displayName(d)}>
          {displayName(d)}
        </div>
      )}
      {marks && marks.count > 0 && <span className={`drift-chip ${marks.classStatus ?? 'changed'}`} title={marks.classStatus === 'removed' ? t('Not in the code any more') : t('Differs from the code')} data-testid={`drift-chip-${id}`}>{marks.classStatus === 'removed' ? t('removed in code') : t('{n} in code', { n: marks.count })}</span>}
      {d.modelId && <SharedBadge id={id} modelId={d.modelId} />}
      <CrossLinkBadge id={id} data={data} />
      {SIDES.map(([hid, pos]) => <Handle key={hid} id={hid} type="source" position={pos} className="handle" />)}
    </div>
  );

  return (
    <>
    <RowCard
      classes={{ root: 'uml-class', body: 'uml-body', row: 'uml-row' }}
      rootClass={`uml-${d.kind}${selected ? ' selected' : ''}${marks?.classStatus === 'removed' ? ' drift-class-removed' : ''}`}
      style={{ ['--uml-accent' as string]: d.accent, width: '100%', height: '100%' }}
      testId={`class-${id}`}
      rowH={CLS.rowH}
      header={header}
      compartments={shown.map(compartment)}
    />
    {marks && marks.ghosts.length > 0 && (
      <div className="drift-ghosts" aria-label={t('Only in the code')} data-testid={`drift-ghosts-${id}`}>
        {marks.ghosts.map((g, i) => <div key={i} className="drift-ghost">+ {g.text}</div>)}
      </div>
    )}
    </>
  );
}

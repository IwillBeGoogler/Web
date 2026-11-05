// table card, key badges and column rows from internal/ui/assets/app.js + app.css.
import { Handle, Position, useReactFlow, useStore, type NodeProps } from '@xyflow/react';
import { ChevronDown, ChevronRight, GripVertical, KeyRound, Link2, MessageSquare, Plus, X } from 'lucide-react';
import type { DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { BufferedInput } from '../BufferedInput';
import { CrossLinkBadge } from '../crosslink/CrossLinks';
import { ER, footerLines, visibleColumns } from '../../lib/er/geometry';
import { RowCard } from '../rows/RowCard';
import { useInlineEdit, useRowReorder } from '../rows/rowHooks';
import { addColumn, moveColumn, patchColumn, removeColumn } from '../../lib/er/relations';
import { DEFAULT_ACCENT, tableOf, type TableColumn, type TableNodeData } from '../../lib/er/tableData';
import { t } from '../../i18n';

export function TableNode({ id, data, selected }: NodeProps<DiagramNode>) {
  const d = data as unknown as TableNodeData;
  const update = useDiagramStore((s) => s.updateTable);
  const updateData = useDiagramStore((s) => s.updateNodeData);
  const editingHeader = useUiStore((s) => s.editingId === id);
  const setEditing = useUiStore((s) => s.setEditing);
  const zoom = useStore((s) => s.transform[2]);
  const field = useInlineEdit<'name' | 'type' | 'comment'>();
  const locked = !!data.locked;
  const accent = d.accent || DEFAULT_ACCENT;
  const variant = d.tableKind ?? 'table';
  const cols = visibleColumns(d);
  const hidden = d.columns.length - cols.length;
  const footer = footerLines(d);
  const isEnum = variant === 'enum';
  const indexed = new Set(d.indexes.flatMap((ix) => ix.columns));

  const edit = (fn: (x: TableNodeData) => TableNodeData) => update(id, fn);
  const flow = useReactFlow();
  // clicking a foreign key's link icon selects the table it points at and brings it into view
  const goToParent = (c: TableColumn) => {
    const st = useDiagramStore.getState();
    const parent = st.nodes.find((n) => n.type === 'table' && n.id !== id && tableOf(n).label === c.fk?.table);
    if (!parent) return;
    st.selectOnly('node', parent.id);
    void flow.fitView({ nodes: [{ id: parent.id }], duration: 250, maxZoom: Math.max(zoom, 1) });
  };
  const reorder = useRowReorder({
    count: cols.length,
    rowH: ER.rowH,
    zoom,
    disabled: locked,
    onMove: (colId, to) => edit((x) => moveColumn(x, colId, x.columns.findIndex((c) => c.id === cols[to].id))),
  });

  const cell = (c: TableColumn, f: 'name' | 'type') => {
    const value = f === 'name' ? c.name : c.type;
    if (f === 'name' && field.is(c.id, 'comment'))
      return (
        <BufferedInput
          autoFocus
          value={c.comment ?? ''}
          placeholder={t('Column comment')}
          className="nodrag er-input er-name"
          aria-label={t('Column comment')}
          onCommit={(v) => edit((x) => patchColumn(x, c.id, { comment: v.trim() || undefined }))}
          onDone={field.close}
        />
      );
    if (field.is(c.id, f))
      return (
        <BufferedInput
          autoFocus
          value={value}
          className={`nodrag er-input er-${f}`}
          aria-label={t(f === 'name' ? 'Column name' : 'Column type')}
          onCommit={(v) => edit((x) => patchColumn(x, c.id, { [f]: v.trim() || value }))}
          onDone={field.close}
        />
      );
    return (
      <span className={`er-${f}`} onDoubleClick={(e) => { e.stopPropagation(); if (!locked) field.open(c.id, f); }} title={f === 'name' && c.comment ? `${value}: ${c.comment}` : value}>
        {value || (isEnum ? '' : '—')}
      </span>
    );
  };

  const toggle = (c: TableColumn, key: 'pk' | 'unique' | 'nullable') => edit((x) => patchColumn(x, c.id, key === 'pk' ? { pk: !c.pk, nullable: c.pk ? c.nullable : false } : { [key]: !c[key] }));

  const header = (
    <div className="er-head">
      <button type="button" className="er-collapse nodrag" aria-label={d.collapsed ? t('Show all columns') : t('Show keys only')} aria-expanded={!d.collapsed} onClick={() => updateData(id, { collapsed: !d.collapsed })}>
        {d.collapsed ? <ChevronRight size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
      </button>
      {editingHeader ? (
        <BufferedInput autoFocus value={d.label} className="nodrag er-input er-title-input" aria-label={t('Table name')} onCommit={(label) => edit((x) => ({ ...x, label: label.trim() || x.label }))} onDone={() => setEditing(null)} />
      ) : (
        <div className="er-titles" onDoubleClick={() => !locked && setEditing(id)}>
          <span className="er-title">{d.label}</span>
          {d.schema ? <span className="er-schema">{d.schema}</span> : null}
        </div>
      )}
      {variant !== 'table' && <span className="er-kind">{t(variant)}</span>}
      <span className="er-count" title={t('{n} columns', { n: d.columns.length })}>{d.columns.length}</span>
      <CrossLinkBadge id={id} data={data} />
      <Handle id="left" type="source" position={Position.Left} className="handle er-h" />
      <Handle id="right" type="source" position={Position.Right} className="handle er-h" />
    </div>
  );

  return (
    <RowCard
      classes={{ root: 'er-table', body: 'er-body', row: 'er-row' }}
      rootClass={`er-${variant}${selected ? ' selected' : ''}${d.collapsed ? ' collapsed' : ''}`}
      style={{ ['--er-accent' as string]: accent, width: '100%', height: '100%' }}
      testId={`table-${id}`}
      rowH={ER.rowH}
      rowHandles
      header={header}
      compartments={[
        {
          id: 'columns',
          rows: cols.map((c, i) => ({
            id: c.id,
            className: `${c.pk ? 'pk' : ''}${c.fk ? `${c.pk ? ' ' : ''}fk` : ''}${reorder.rowClass(c.id, i)}`.trim(),
            children: (
              <>
                {!isEnum && (
                  <span className="er-grip nodrag" onPointerDown={(e) => reorder.start(e, c.id, i)} aria-hidden="true" title={t('Drag to reorder')}>
                    <GripVertical size={12} aria-hidden />
                  </span>
                )}
                {!isEnum && (
                  c.fk && !c.pk ? (
                    <button type="button" className="er-key er-fk-jump nodrag" title={t('References {ref} (click to go)', { ref: `${c.fk.table}.${c.fk.column}` })} aria-label={t('Go to {name}', { name: c.fk.table })} onClick={(e) => { e.stopPropagation(); goToParent(c); }}>
                      <Link2 size={12} className="k-fk" aria-hidden />
                    </button>
                  ) : (
                    <span className="er-key" aria-hidden>{c.pk ? <KeyRound size={12} className="k-pk" /> : null}</span>
                  )
                )}
                {cell(c, 'name')}
                {!isEnum && cell(c, 'type')}
                {!isEnum && c.default && <span className="er-default" title={`DEFAULT ${c.default}`}>= {c.default}</span>}
                {!isEnum && (
                  <span className="er-flags">
                    {c.comment && <MessageSquare size={10} className="er-has-comment" aria-label={t('has comment')} />}
                    {indexed.has(c.name) && <span className="er-flag ix" title={t('Indexed')}>IX</span>}
                    {c.unique && !c.pk && <span className="er-flag uq" title="UNIQUE">UQ</span>}
                    {!c.nullable && !c.pk && <span className="er-flag nn" title="NOT NULL">NN</span>}
                    {c.nullable && !c.pk && <span className="er-flag null" title={t('nullable')}>NULL</span>}
                  </span>
                )}
                {!locked && (
                  <span className="er-actions nodrag">
                    {!isEnum && <button type="button" className={c.pk ? 'on' : ''} aria-label={t('PK, primary key: {name}', { name: c.name })} title={t('Primary key')} onClick={() => toggle(c, 'pk')}>PK</button>}
                    {!isEnum && <button type="button" className={!c.nullable ? 'on' : ''} aria-label={t('NN, not null: {name}', { name: c.name })} title="NOT NULL" onClick={() => toggle(c, 'nullable')}>NN</button>}
                    {!isEnum && <button type="button" className={c.unique ? 'on' : ''} aria-label={t('UQ, unique: {name}', { name: c.name })} title={t('Unique')} onClick={() => toggle(c, 'unique')}>UQ</button>}
                    <button type="button" className={c.comment ? 'on' : ''} aria-label={t('Comment: {name}', { name: c.name })} title={c.comment || t('Add comment')} onClick={() => field.open(c.id, 'comment')}><MessageSquare size={11} aria-hidden /></button>
                    <button type="button" aria-label={t('Delete column {name}', { name: c.name })} title={t('Delete column')} onClick={() => edit((x) => removeColumn(x, c.id))}><X size={11} aria-hidden /></button>
                  </span>
                )}
              </>
            ),
          })),
          after: !locked && !d.collapsed ? (
            <button type="button" className="er-add nodrag" aria-label={t('Add column')} title={t('Add column')} onClick={() => { edit((x) => addColumn(x, isEnum ? 'value' : 'column', isEnum ? '' : 'text')); }}>
              <Plus size={12} aria-hidden />
            </button>
          ) : null,
        },
      ]}
      below={
        <>
          {d.collapsed && hidden > 0 && <div className="er-more">{t('+{n} more', { n: hidden })}</div>}
          {footer > 0 && (
            <div className="er-foot" style={{ paddingTop: ER.footerPad }}>
              {d.indexes.slice(0, ER.maxFooterLines).map((ix, i) => (
                <div key={`i${i}`} className="er-foot-line" title={ix.name ?? ix.columns.join(', ')}>
                  <span className={`er-tag${ix.unique ? ' uq' : ''}`}>{ix.unique ? 'UNIQUE' : 'INDEX'}</span>
                  <span className="er-foot-text">{ix.name ? `${ix.name} ` : ''}({ix.columns.join(', ')})</span>
                </div>
              ))}
              {d.checks.slice(0, Math.max(0, ER.maxFooterLines - d.indexes.length)).map((ck, i) => (
                <div key={`c${i}`} className="er-foot-line" title={ck.expr}>
                  <span className="er-tag chk">CHECK</span>
                  <span className="er-foot-text">{ck.name ? `${ck.name}: ` : ''}{ck.expr}</span>
                </div>
              ))}
              {d.indexes.length + d.checks.length > ER.maxFooterLines && <div className="er-foot-line er-more-line">{t('+{n} more', { n: d.indexes.length + d.checks.length - ER.maxFooterLines })}</div>}
            </div>
          )}
        </>
      }
    />
  );
}

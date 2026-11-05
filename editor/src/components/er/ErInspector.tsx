import type { ReactNode } from 'react';
import type { DiagramEdge, DiagramNode } from '../../types';
import { useDiagramStore } from '../../store/diagramStore';
import { cardinalityLabel } from '../../lib/er/cardinality';
import { ACCENTS, relationOf, tableOf, type TableNodeData } from '../../lib/er/tableData';
import type { Cardinality } from '../../lib/er/types';
import { BufferedInput } from '../BufferedInput';
import { ColorField } from '../ui/ColorField';
import { Toggle } from '../ui/Toggle';
import { t } from '../../i18n';

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="prop-row">
    <span className="prop-label">{t(label)}</span>
    {children}
  </div>
);

/** Inspector body for one table node: name, schema, comment, header colour, collapsed, indexes and checks. */
export function TableInspector({ node }: { node: DiagramNode }) {
  const d = tableOf(node);
  const update = useDiagramStore((s) => s.updateTable);
  const set = (fn: (x: TableNodeData) => TableNodeData) => update(node.id, fn);
  const isEnum = d.tableKind === 'enum';
  return (
    <>
      <Row label="Name"><BufferedInput value={d.label} aria-label={t('Table name')} onCommit={(label) => label.trim() && set((x) => ({ ...x, label: label.trim() }))} /></Row>
      {!isEnum && <Row label="Schema"><BufferedInput value={d.schema ?? ''} placeholder="public" aria-label={t('Schema')} onCommit={(schema) => set((x) => ({ ...x, schema: schema.trim() || undefined }))} /></Row>}
      <Row label="Kind">
        <select aria-label={t('Table kind')} value={d.tableKind ?? 'table'} onChange={(e) => set((x) => ({ ...x, tableKind: e.target.value as TableNodeData['tableKind'] }))}>
          <option value="table">{t('Table')}</option>
          <option value="view">{t('View')}</option>
          <option value="enum">{t('Enum')}</option>
        </select>
      </Row>
      <Row label="Header colour"><ColorField label={t('Header colour')} value={d.accent} presets={[...ACCENTS]} onChange={(accent) => set((x) => ({ ...x, accent }))} /></Row>
      <Row label="Comment"><BufferedInput multiline value={d.comment ?? ''} aria-label={t('Table comment')} onCommit={(comment) => set((x) => ({ ...x, comment: comment || undefined }))} /></Row>
      <Toggle label={t('Show keys only (collapse)')} checked={d.collapsed} onChange={(collapsed) => set((x) => ({ ...x, collapsed }))} />
      {!isEnum && (
        <>
          <div className="prop-subhead">{t('Indexes')}</div>
          {d.indexes.map((ix, i) => (
            <div key={i} className="prop-row er-ix">
              <BufferedInput value={ix.name ?? ''} placeholder="name" aria-label={t('Index {n} name', { n: i + 1 })} onCommit={(name) => set((x) => ({ ...x, indexes: x.indexes.map((y, k) => (k === i ? { ...y, name: name || undefined } : y)) }))} />
              <BufferedInput value={ix.columns.join(', ')} placeholder="col1, col2" aria-label={t('Index {n} columns', { n: i + 1 })} onCommit={(cols) => set((x) => ({ ...x, indexes: x.indexes.map((y, k) => (k === i ? { ...y, columns: cols.split(',').map((c) => c.trim()).filter(Boolean) } : y)) }))} />
              <label className="er-ix-uq"><input type="checkbox" aria-label={t('Index {n} unique', { n: i + 1 })} checked={ix.unique} onChange={(e) => set((x) => ({ ...x, indexes: x.indexes.map((y, k) => (k === i ? { ...y, unique: e.target.checked } : y)) }))} /> UQ</label>
              <button type="button" aria-label={t('Remove index {n}', { n: i + 1 })} onClick={() => set((x) => ({ ...x, indexes: x.indexes.filter((_, k) => k !== i) }))}>×</button>
            </div>
          ))}
          <div className="btn-row"><button type="button" onClick={() => set((x) => ({ ...x, indexes: [...x.indexes, { columns: [x.columns[0]?.name ?? 'id'], unique: false }] }))}>{t('Add index')}</button></div>
          <div className="prop-subhead">{t('Checks')}</div>
          {d.checks.map((ck, i) => (
            <div key={i} className="prop-row er-ix">
              <BufferedInput value={ck.expr} aria-label={t('Check {n}', { n: i + 1 })} onCommit={(expr) => set((x) => ({ ...x, checks: x.checks.map((y, k) => (k === i ? { ...y, expr } : y)) }))} />
              <button type="button" aria-label={t('Remove check {n}', { n: i + 1 })} onClick={() => set((x) => ({ ...x, checks: x.checks.filter((_, k) => k !== i) }))}>×</button>
            </div>
          ))}
          <div className="btn-row"><button type="button" onClick={() => set((x) => ({ ...x, checks: [...x.checks, { expr: `${x.columns[0]?.name ?? 'id'} IS NOT NULL` }] }))}>{t('Add check')}</button></div>
        </>
      )}
    </>
  );
}

/** Inspector rows for an ER relation edge: cardinality, optional, identifying, label. */
export function RelationInspector({ edge }: { edge: DiagramEdge }) {
  const r = relationOf(edge);
  const setCard = useDiagramStore((s) => s.setCardinality);
  const patch = useDiagramStore((s) => s.updateRelations);
  const reverse = useDiagramStore((s) => s.reverseEdge);
  const junction = useDiagramStore((s) => s.makeJunction);
  if (!r) return null;
  return (
    <>
      <Row label="Cardinality">
        <select aria-label={t('Cardinality')} value={r.cardinality} onChange={(e) => setCard([edge.id], e.target.value as Cardinality)}>
          {(Object.keys(cardinalityLabel) as Cardinality[]).map((c) => <option key={c} value={c}>{c} · {t(cardinalityLabel[c])}</option>)}
        </select>
      </Row>
      <Toggle label={t('Optional (nullable key)')} checked={r.optional} onChange={(optional) => patch([edge.id], { optional })} />
      <Toggle label={t('Identifying (solid line)')} checked={r.identifying} onChange={(identifying) => patch([edge.id], { identifying })} />
      <Toggle label={t('Many side needs at least one')} checked={!!r.manyRequired} onChange={(manyRequired) => patch([edge.id], { manyRequired })} />
      <div className="btn-row">
        <button type="button" onClick={() => reverse(edge.id)}>{t('Reverse')}</button>
        {r.cardinality === 'N:M' && <button type="button" onClick={() => junction(edge.id)}>{t('Create junction table')}</button>}
      </div>
    </>
  );
}

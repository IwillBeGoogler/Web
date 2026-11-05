// fixed row heights replace Seedora's DOM measurements.
import type { DiagramNode } from '../../types';
import type { TableColumn, TableNodeData } from './tableData';
import { layoutRows, rowAnchorY, type RowLayout } from '../rows/engine';

/** Fixed metrics: every row centre is computable without touching the DOM. */
export const ER = {
  headerH: 40,
  rowH: 28,
  footerLine: 18,
  footerPad: 10,
  bottomPad: 6,
  minW: 220,
  maxW: 400,
  charW: 7.1,
  sidePad: 12,
  maxFooterLines: 5,
} as const;

export const visibleColumns = (d: TableNodeData): TableColumn[] => (d.collapsed ? d.columns.filter((c) => c.pk || !!c.fk) : d.columns);

export function footerLines(d: TableNodeData): number {
  if (d.collapsed) return 0;
  const n = d.indexes.length + d.checks.length;
  return n <= ER.maxFooterLines ? n : ER.maxFooterLines + 1;
}

/** The table as rows for the shared row engine: one `columns` compartment, an index / check footer. */
export function tableLayout(d: TableNodeData): RowLayout {
  const f = footerLines(d);
  return layoutRows({
    headerH: ER.headerH,
    rowH: ER.rowH,
    bottomPad: ER.bottomPad,
    footerH: f ? ER.footerPad + f * ER.footerLine : 0,
    compartments: [{ id: 'columns', rows: visibleColumns(d).map((c) => c.id), minRows: 1 }],
  });
}

export const tableHeight = (d: TableNodeData): number => tableLayout(d).height;

export function tableWidth(d: TableNodeData): number {
  const cols = visibleColumns(d);
  let w = (d.schema ? d.schema.length + 1 : 0) * ER.charW + d.label.length * 8 + 110;
  for (const c of cols) w = Math.max(w, (c.name.length + Math.min(c.type.length, 22)) * ER.charW + 96);
  return Math.round(Math.min(ER.maxW, Math.max(ER.minW, w)) / 10) * 10;
}

export const tableSize = (d: TableNodeData): { width: number; height: number } => ({ width: tableWidth(d), height: tableHeight(d) });

/** Local y of a column row's centre (the header centre when the column is hidden or unknown). */
export const rowCenterY = (d: TableNodeData, colId: string | undefined): number => rowAnchorY(tableLayout(d), colId);

/** Give a table node its computed width / height (call after any change to columns, name, collapse). */
export function withTableSize(n: DiagramNode): DiagramNode {
  const d = n.data as unknown as TableNodeData;
  const { width, height } = tableSize(d);
  return { ...n, width, height, style: { ...(n.style ?? {}), width, height } };
}

export function nextColumnId(d: Pick<TableNodeData, 'columns'>): string {
  let max = -1;
  for (const c of d.columns) {
    const m = /^c(\d+)$/.exec(c.id);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `c${max + 1}`;
}

export interface WindowRange {
  start: number;
  end: number;
  padTop: number;
  padBottom: number;
}

/** Row virtualization maths. Rows [start, end) should be rendered. */
export function computeWindow(scrollTop: number, rowHeight: number, viewportHeight: number, rowCount: number, overscan = 2): WindowRange {
  const first = Math.floor(Math.max(0, scrollTop) / rowHeight);
  const visible = Math.ceil(viewportHeight / rowHeight);
  const start = Math.max(0, first - overscan);
  const end = Math.min(rowCount, first + visible + overscan);
  return { start, end, padTop: start * rowHeight, padBottom: Math.max(0, (rowCount - end) * rowHeight) };
}

export const chunkRows = <T,>(items: T[], cols: number): T[][] => {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += cols) rows.push(items.slice(i, i + cols));
  return rows;
};

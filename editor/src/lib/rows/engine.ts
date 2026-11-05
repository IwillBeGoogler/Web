/**
 * Row-based node engine shared by ER tables and UML classes: a header, then compartments of fixed-height rows
 * (plus an optional footer). Every row's position is computed from the data, never measured from the DOM, so
 * routing can attach lines at a row's centre and node sizes are known before anything renders.
 */
export interface CompartmentSpec {
  id: string;
  /** row ids in display order */
  rows: string[];
  /** px of space above / below the rows (a UML compartment has a divider line and some air) */
  padTop?: number;
  padBottom?: number;
  /** rows reserved for an empty compartment (an ER table with no columns still shows one blank row) */
  minRows?: number;
  collapsed?: boolean;
  /** collapsed: height of the one-line summary ("+3 more") that replaces the rows */
  summaryH?: number;
  /** collapsed: these rows stay visible (keys only) */
  keepRows?: string[];
}
export interface RowEngineSpec {
  headerH: number;
  rowH: number;
  compartments: CompartmentSpec[];
  /** px under the last compartment (index / check lines in ER) */
  footerH?: number;
  bottomPad?: number;
}
export interface RowBox {
  id: string;
  compartment: string;
  /** index among the VISIBLE rows of its compartment */
  index: number;
  top: number;
  height: number;
  center: number;
}
export interface CompartmentBox {
  id: string;
  top: number;
  height: number;
  collapsed: boolean;
  rows: RowBox[];
}
export interface RowLayout {
  headerH: number;
  height: number;
  compartments: CompartmentBox[];
  /** visible rows by id */
  rows: Map<string, RowBox>;
}

export function layoutRows(spec: RowEngineSpec): RowLayout {
  const rows = new Map<string, RowBox>();
  const compartments: CompartmentBox[] = [];
  let y = spec.headerH;
  for (const c of spec.compartments) {
    const top = y;
    const padTop = c.padTop ?? 0;
    const padBottom = c.padBottom ?? 0;
    const keep = c.collapsed ? new Set(c.keepRows ?? []) : null;
    const shown = keep ? c.rows.filter((r) => keep.has(r)) : c.rows;
    const boxes: RowBox[] = [];
    if (c.collapsed && !c.keepRows) {
      y += padTop + (c.summaryH ?? 0) + padBottom;
    } else {
      y += padTop;
      shown.forEach((id, index) => {
        const box = { id, compartment: c.id, index, top: y, height: spec.rowH, center: y + spec.rowH / 2 };
        boxes.push(box);
        rows.set(id, box);
        y += spec.rowH;
      });
      if (!shown.length && c.minRows) y += c.minRows * spec.rowH;
      y += padBottom;
    }
    compartments.push({ id: c.id, top, height: y - top, collapsed: !!c.collapsed, rows: boxes });
  }
  return { headerH: spec.headerH, height: y + (spec.footerH ?? 0) + (spec.bottomPad ?? 0), compartments, rows };
}

/** Local y where a line attaches for a row: the row centre, or the header centre when the row is hidden / unknown. */
export function rowAnchorY(layout: RowLayout, rowId: string | undefined): number {
  const r = rowId ? layout.rows.get(rowId) : undefined;
  return r ? r.center : layout.headerH / 2;
}

/** The visible row under a local y. */
export function rowAt(layout: RowLayout, y: number): RowBox | undefined {
  for (const r of layout.rows.values()) if (y >= r.top && y < r.top + r.height) return r;
  return undefined;
}

/** `ids` with `id` moved to position `to` (clamped). */
export function reorderRows(ids: string[], id: string, to: number): string[] {
  const from = ids.indexOf(id);
  if (from < 0) return ids;
  const out = [...ids];
  out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, id);
  return out;
}

/** Target index while dragging a row: `from` shifted by the pointer delta (screen px) in rows at the current zoom. */
export function rowDropIndex(from: number, dy: number, rowH: number, zoom: number, count: number): number {
  return Math.max(0, Math.min(count - 1, from + Math.round(dy / (rowH * zoom))));
}

import type { Rect } from './geometry';

/** Uniform bucket grid over rectangles: window queries touch only the nearby buckets instead of every node. */
export class RectGrid<T> {
  private cells = new Map<number, { id: T; r: Rect }[]>();
  constructor(private cell = 400) {}

  private key(cx: number, cy: number): number {
    // cantor-like pairing that is collision-free for |c| < 2^20 (cells of 400px: +-400M px)
    return (cx + 1048576) * 2097152 + (cy + 1048576);
  }

  insert(id: T, r: Rect): void {
    const item = { id, r };
    const c = this.cell;
    for (let cx = Math.floor(r.x / c); cx <= Math.floor((r.x + r.width) / c); cx++)
      for (let cy = Math.floor(r.y / c); cy <= Math.floor((r.y + r.height) / c); cy++) {
        const k = this.key(cx, cy);
        const l = this.cells.get(k);
        if (l) l.push(item);
        else this.cells.set(k, [item]);
      }
  }

  /** ids of all rectangles that overlap `q` (each once) */
  query(q: Rect): T[] {
    const c = this.cell;
    const seen = new Set<{ id: T; r: Rect }>();
    const out: T[] = [];
    for (let cx = Math.floor(q.x / c); cx <= Math.floor((q.x + q.width) / c); cx++)
      for (let cy = Math.floor(q.y / c); cy <= Math.floor((q.y + q.height) / c); cy++) {
        const l = this.cells.get(this.key(cx, cy));
        if (!l) continue;
        for (const it of l) {
          if (seen.has(it)) continue;
          seen.add(it);
          const r = it.r;
          if (r.x < q.x + q.width && r.x + r.width > q.x && r.y < q.y + q.height && r.y + r.height > q.y) out.push(it.id);
        }
      }
    return out;
  }
}

export interface Pt {
  x: number;
  y: number;
}

/** Cell positions (top-left) for `n` cells in rows of `cols`. */
export function gridLayout(n: number, cols: number, cellW: number, cellH: number, origin: Pt = { x: 0, y: 0 }): Pt[] {
  const c = Math.max(1, Math.min(cols, n));
  return Array.from({ length: n }, (_, i) => ({ x: origin.x + (i % c) * cellW, y: origin.y + Math.floor(i / c) * cellH }));
}
export const gridSize = (n: number, cols: number, cellW: number, cellH: number) => ({
  width: Math.max(1, Math.min(cols, n)) * cellW,
  height: Math.max(1, Math.ceil(n / Math.max(1, Math.min(cols, n)))) * cellH,
});

/** Ring: `n` points on a circle, the first at the top, clockwise. Returns node CENTRES. */
export function ringLayout(n: number, radius: number, center: Pt): Pt[] {
  return Array.from({ length: n }, (_, i) => {
    const a = -Math.PI / 2 + (2 * Math.PI * i) / Math.max(1, n);
    return { x: center.x + radius * Math.cos(a), y: center.y + radius * Math.sin(a) };
  });
}
/** Radius that keeps neighbouring nodes at least `gap` apart. */
export const ringRadius = (n: number, gap: number): number => Math.max(gap, gap / (2 * Math.sin(Math.PI / Math.max(3, n))));

/** Tiered: rows of cells, one row per tier (e.g. masters on top, data below). Each tier centred on the widest. */
export function tieredLayout(tiers: number[], cellW: number, cellH: number, gapY = 0): Pt[][] {
  const widest = Math.max(1, ...tiers) * cellW;
  return tiers.map((count, t) => Array.from({ length: count }, (_, i) => ({ x: (widest - count * cellW) / 2 + i * cellW, y: t * (cellH + gapY) })));
}

/** Shard matrix: shards are columns, replicas are rows. Index = shard * replicas + replica. */
export function shardMatrix(shards: number, replicas: number, cellW: number, cellH: number): Pt[] {
  const out: Pt[] = [];
  for (let s = 0; s < shards; s++) for (let r = 0; r < replicas; r++) out.push({ x: s * cellW, y: r * cellH });
  return out;
}

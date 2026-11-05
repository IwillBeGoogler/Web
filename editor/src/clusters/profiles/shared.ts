import { HEADER_H, NODE_H, NODE_W, PAD, ROLE_H } from '../builder';
import type { Pt } from '../layout';

/** 56px between neighbours: an edge label chip ("async", "oplog") fits in the gap without touching either node */
export const CELL_W = NODE_W + 56;
export const CELL_H = NODE_H + ROLE_H + 28;
export const GROUP_HEAD = 34;
export const GROUP_PAD = 18;

export const odd = (n: number) => n % 2 === 1;
export const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? '' : 's'}`;
/** x of the i-th cell in a row of `n` cells inside a box of width `w` (centred) */
export const rowX = (i: number, n: number, w: number) => (w - n * CELL_W) / 2 + i * CELL_W + (CELL_W - NODE_W) / 2;
export const boxFor = (cols: number, rows: number) => ({ width: cols * CELL_W + GROUP_PAD * 2, height: GROUP_HEAD + rows * CELL_H + GROUP_PAD });
export { HEADER_H, NODE_H, NODE_W, PAD };
export type { Pt };

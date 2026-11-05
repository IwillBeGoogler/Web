/** Sticky notes: colours, auto font size, creation and the Tab / Shift+Enter flow. Pure. */
import type { DiagramNode } from '../../types';
import { nodeSize } from '../graph';
import { overlaps } from '../placement';

export interface StickyColor { id: string; name: string; fill: string; stroke: string }
export const STICKY_COLORS: StickyColor[] = [
  { id: 'yellow', name: 'Yellow', fill: '#fff3a3', stroke: '#e0c84a' },
  { id: 'orange', name: 'Orange', fill: '#ffd8a8', stroke: '#e8a35a' },
  { id: 'pink', name: 'Pink', fill: '#ffc9de', stroke: '#e58fb1' },
  { id: 'red', name: 'Red', fill: '#ffb3b3', stroke: '#e07878' },
  { id: 'purple', name: 'Purple', fill: '#e0ccff', stroke: '#b194e8' },
  { id: 'blue', name: 'Blue', fill: '#bfe0ff', stroke: '#7db6ec' },
  { id: 'teal', name: 'Teal', fill: '#b5efe3', stroke: '#6fcfbc' },
  { id: 'green', name: 'Green', fill: '#c8f0b5', stroke: '#8fcf72' },
];
export const colorById = (id: string | undefined): StickyColor => STICKY_COLORS.find((c) => c.id === id) ?? STICKY_COLORS[0];
export const colorIdOfFill = (fill: unknown): string => STICKY_COLORS.find((c) => c.fill === fill)?.id ?? 'custom';

export const STICKY_SIZE = { width: 160, height: 140 };
export const STICKY_GAP = 24;
const FONT_MIN = 10;
const FONT_MAX = 28;
const PAD = 12;
const CHAR_W = 0.56; // average glyph width / font size
const LINE_H = 1.25;

/** number of lines `text` takes when wrapped at `perLine` characters (long words are broken) */
export function wrapLineCount(text: string, perLine: number): number {
  const width = Math.max(1, Math.floor(perLine));
  let lines = 0;
  for (const para of text.split('\n')) {
    let cur = 0;
    let n = 1;
    for (const word of para.split(/\s+/).filter(Boolean)) {
      let w = word.length;
      while (w > width) {
        // fill the rest of the line, then break
        if (cur > 0) { n++; cur = 0; }
        w -= width;
        if (w > 0) n++;
      }
      if (cur === 0) cur = w;
      else if (cur + 1 + w <= width) cur += 1 + w;
      else { n++; cur = w; }
    }
    lines += n;
  }
  return Math.max(1, lines);
}

/** the largest font size (10..28) at which `text` fits a sticky of w x h, keeping words whole when any size allows it */
export function fitFontSize(text: string, w: number, h: number): number {
  const longest = Math.max(1, ...text.split(/\s+/).map((x) => x.length));
  const fits = (size: number, wholeWords: boolean): boolean => {
    const perLine = (w - PAD * 2) / (size * CHAR_W);
    if (wholeWords && longest > perLine) return false;
    return wrapLineCount(text, perLine) * size * LINE_H <= h - PAD * 2;
  };
  for (const whole of [true, false]) for (let size = FONT_MAX; size >= FONT_MIN; size--) if (fits(size, whole)) return size;
  return FONT_MIN;
}

export interface StickyOpts { color?: string; author?: string; authorId?: string; private?: boolean; label?: string }

export function createSticky(id: string, at: { x: number; y: number }, o: StickyOpts = {}): DiagramNode {
  const c = colorById(o.color);
  return {
    id, type: 'sticky',
    position: { x: at.x - STICKY_SIZE.width / 2, y: at.y - STICKY_SIZE.height / 2 },
    width: STICKY_SIZE.width, height: STICKY_SIZE.height,
    data: {
      label: o.label ?? '', fill: c.fill, stroke: c.stroke, strokeWidth: 1, fontSize: 18, autoFont: true,
      ...(o.author ? { author: o.author } : {}),
      ...(o.authorId ? { authorId: o.authorId } : {}),
      ...(o.private ? { private: true } : {}),
    },
  };
}

/** Tab: the next sticky to the right; Shift+Enter: below. Same size and colour, first free slot in that direction. */
export function nextSticky(from: DiagramNode, nodes: DiagramNode[], dir: 'right' | 'below', id: string, who: { author?: string; authorId?: string; private?: boolean } = {}): DiagramNode {
  const { width, height } = nodeSize(from);
  const others = nodes.filter((n) => n.id !== from.id && !n.hidden && n.type !== 'frame' && n.type !== 'group').map((n) => ({ ...n.position, ...nodeSize(n) }));
  let step = 1;
  const at = () => ({
    x: from.position.x + (dir === 'right' ? (width + STICKY_GAP) * step : 0),
    y: from.position.y + (dir === 'below' ? (height + STICKY_GAP) * step : 0),
  });
  while (step < 200 && others.some((o) => overlaps({ ...at(), width, height }, o))) step++;
  const p = at();
  const { author: _a, authorId: _i, private: _p, label: _l, ...keep } = from.data as Record<string, unknown>;
  void _a; void _i; void _p; void _l;
  return {
    id, type: 'sticky', position: p, width, height,
    data: {
      ...keep, label: '',
      ...(who.author ? { author: who.author } : {}),
      ...(who.authorId ? { authorId: who.authorId } : {}),
      ...(who.private ? { private: true } : {}),
    } as DiagramNode['data'],
  };
}

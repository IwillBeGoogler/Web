/** Validation of the Board node kinds (schema v6). Mirrored by server/src/schema/project.ts. */
const PTS_RE = /^[ab]( -?[0-9a-z]+)*$/;
export const MAX_PTS_CHARS = 400_000;

export function ptsValid(s: string): boolean {
  if (s.length > MAX_PTS_CHARS || !PTS_RE.test(s)) return false;
  const tokens = s.length > 1 ? s.slice(2).split(' ').length : 0;
  return tokens % (s[0] === 'b' ? 3 : 2) === 0;
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** null = fine, otherwise the problem */
export function validateBoardNodeData(type: string, d: Record<string, unknown>, n: { width?: unknown; height?: unknown }): string | null {
  switch (type) {
    case 'frame':
      if (!isNum(n.width) || n.width <= 0 || !isNum(n.height) || n.height <= 0) return 'frame nodes need a positive width and height';
      if (d.order !== undefined && !isNum(d.order)) return 'data.order must be a number';
      return null;
    case 'sticky':
      for (const k of ['private', 'autoFont'] as const) if (d[k] !== undefined && typeof d[k] !== 'boolean') return `data.${k} must be boolean`;
      for (const k of ['author', 'authorId'] as const) if (d[k] !== undefined && typeof d[k] !== 'string') return `data.${k} must be a string`;
      return null;
    case 'draw':
      if (d.brush !== undefined && d.brush !== 'pen' && d.brush !== 'highlighter') return 'data.brush must be pen|highlighter';
      if (d.pts !== undefined && (typeof d.pts !== 'string' || !ptsValid(d.pts))) return 'data.pts is not a valid stroke encoding';
      return null;
    case 'mindmap':
      if (d.root !== undefined && typeof d.root !== 'boolean') return 'data.root must be boolean';
      if (d.side !== undefined && d.side !== 'l' && d.side !== 'r' && d.side !== 'c') return 'data.side must be l|r|c';
      if (d.branch !== undefined && !isNum(d.branch)) return 'data.branch must be a number';
      return null;
    case 'stamp':
      if (typeof d.emoji !== 'string' || !d.emoji || d.emoji.length > 32) return 'stamp nodes need an emoji (1 to 32 characters)';
      return null;
    default:
      return null;
  }
}

/** Validation of the design-tool node fields (schema v7). Mirrored by server/src/schema/project.ts. */
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const oneOf = (v: unknown, list: string[]) => typeof v === 'string' && list.includes(v);
const SIZING = ['fixed', 'fill', 'hug'];

/** null = fine, otherwise the problem */
export function validateDesignData(d: Record<string, unknown>): string | null {
  if (d.hidden !== undefined && typeof d.hidden !== 'boolean') return 'data.hidden must be boolean';
  for (const k of ['instKey', 'componentMain', 'source'] as const) if (d[k] !== undefined && typeof d[k] !== 'string') return `data.${k} must be a string`;
  if (typeof d.source === 'string' && d.source.length > 2000) return 'data.source is too long';
  if (d.instance !== undefined) {
    const i = d.instance;
    if (!isObj(i) || typeof i.componentId !== 'string' || !isNum(i.rev) || !isObj(i.overrides) || Object.values(i.overrides).some((o) => !isObj(o))) return 'data.instance needs componentId, rev and overrides';
  }
  if (d.autoLayout !== undefined) {
    const a = d.autoLayout;
    if (!isObj(a) || !oneOf(a.mode, ['row', 'column', 'grid']) || !isNum(a.gap) || !isNum(a.padding) || !oneOf(a.align, ['start', 'center', 'end', 'stretch']) || !oneOf(a.justify, ['start', 'center', 'end', 'between']) || typeof a.hugW !== 'boolean' || typeof a.hugH !== 'boolean') return 'data.autoLayout is not valid';
    if ((a.gapY !== undefined && !isNum(a.gapY)) || (a.columns !== undefined && !isNum(a.columns))) return 'data.autoLayout gapY / columns must be numbers';
  }
  if (d.layoutSizing !== undefined && !(isObj(d.layoutSizing) && oneOf(d.layoutSizing.w, SIZING) && oneOf(d.layoutSizing.h, SIZING))) return 'data.layoutSizing must be {w,h} of fixed|fill|hug';
  if (d.constraints !== undefined && !(isObj(d.constraints) && oneOf(d.constraints.h, ['left', 'right', 'center', 'stretch', 'scale']) && oneOf(d.constraints.v, ['top', 'bottom', 'center', 'stretch', 'scale']))) return 'data.constraints is not valid';
  if (d.link !== undefined && !(isObj(d.link) && typeof d.link.fileId === 'string' && d.link.fileId.length > 0 && (d.link.nodeId === undefined || typeof d.link.nodeId === 'string'))) return 'data.link needs a fileId';
  if (d.styles !== undefined) {
    if (!isObj(d.styles) || Object.values(d.styles).some((v) => v !== undefined && typeof v !== 'string')) return 'data.styles must map to style ids';
  }
  return null;
}

export const MAX_GUIDES = 200;
export function validGuides(g: unknown): boolean {
  return Array.isArray(g) && g.length <= MAX_GUIDES && g.every((x) => isObj(x) && typeof x.id === 'string' && x.id.length > 0 && (x.axis === 'x' || x.axis === 'y') && isNum(x.pos));
}

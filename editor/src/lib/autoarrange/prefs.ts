import { DEFAULT_ARRANGE, type ArrangeAlgo, type ArrangeDirection, type ArrangeSpacing } from './engine';

/** the options a person picks in the Auto layout popover; remembered per file (project) */
export interface ArrangePrefs { algo: ArrangeAlgo; direction: ArrangeDirection | null; spacing: ArrangeSpacing }
export const DEFAULT_PREFS: ArrangePrefs = { algo: DEFAULT_ARRANGE.algo, direction: DEFAULT_ARRANGE.direction, spacing: DEFAULT_ARRANGE.spacing };
const KEY = 'sdd:arrange:';
const ALGOS: ArrangeAlgo[] = ['auto', 'layered', 'erd', 'uml', 'tree', 'grid'];

export function loadPrefs(fileId: string | null | undefined, st: Pick<Storage, 'getItem'> = localStorage): ArrangePrefs {
  try {
    const v = JSON.parse(st.getItem(KEY + (fileId ?? '')) ?? 'null');
    if (v && typeof v === 'object')
      return {
        algo: ALGOS.includes(v.algo) ? v.algo : DEFAULT_PREFS.algo,
        direction: v.direction === 'TB' || v.direction === 'LR' ? v.direction : null,
        spacing: v.spacing === 'compact' || v.spacing === 'roomy' ? v.spacing : 'normal',
      };
  } catch { /* fall through */ }
  return { ...DEFAULT_PREFS };
}
export function savePrefs(fileId: string | null | undefined, p: ArrangePrefs, st: Pick<Storage, 'setItem'> = localStorage): void {
  try { st.setItem(KEY + (fileId ?? ''), JSON.stringify(p)); } catch { /* ignore */ }
}

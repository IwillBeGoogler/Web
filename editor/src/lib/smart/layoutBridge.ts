import { alignGroups, applyLayout, separateLabels, LAYOUTS, type LayoutAlgo, type LayoutOptions } from '@core/layout';
import type { CNode, CPage } from '@core/types';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import type { DiagramEdge, DiagramNode } from '../../types';
import { activePage } from '../dsl/bridge';
import { finalizeNode } from '../dsl/finalize';
import { styleEdge } from '../graph';

export { LAYOUTS };
export const LAYOUT_LABEL: Record<LayoutAlgo, string> = { layered: 'Layered (flow)', orthogonal: 'Orthogonal (snapped grid)', radial: 'Radial', tree: 'Tree', force: 'Force-directed', grid: 'Compact grid' };

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** run `fn` on a copy of the active page and write what it changed back as ONE undo step; untouched nodes keep their identity */
function commit(fn: (page: CPage) => void): boolean {
  const page: CPage = structuredClone(activePage());
  fn(page);
  const nodes = new Map(page.nodes.map((n) => [n.id, n]));
  const edges = new Map(page.edges.map((e) => [e.id, e]));
  return useDiagramStore.getState().transform((ns, es) => {
    const outN = ns.map((n) => {
      const r = nodes.get(n.id);
      if (!r || (same(r.position, n.position) && r.width === n.width && r.height === n.height)) return n;
      return finalizeNode({ ...n, position: r.position, ...(r.width !== undefined ? { width: r.width } : {}), ...(r.height !== undefined ? { height: r.height } : {}) } as unknown as DiagramNode);
    });
    const outE = es.map((e) => {
      const r = edges.get(e.id);
      return r && !same(r.data, e.data) ? styleEdge({ ...e, data: r.data } as unknown as DiagramEdge) : e;
    });
    return outN.every((n, i) => n === ns[i]) && outE.every((e, i) => e === es[i]) ? null : { nodes: outN, edges: outE };
  });
}

/** lay the whole page out (or only the selected nodes: "tidy selection") */
export function runLayout(algo: LayoutAlgo, opts: LayoutOptions & { selection?: boolean } = {}): boolean {
  const sel = useDiagramStore.getState().nodes.filter((n) => n.selected && !n.data.locked).map((n) => n.id);
  const only = opts.selection ? sel : undefined;
  if (opts.selection && sel.length < 2) { toast.info('Select two or more components to tidy'); return false; }
  const { selection: _s, ...rest } = opts;
  void _s;
  const changed = commit((p) => { applyLayout(p, algo, { ...rest, ...(only ? { only } : {}) }); });
  if (!changed) toast.info('Already tidy');
  return changed;
}
export const runSeparateLabels = (): boolean => {
  let n = 0;
  const changed = commit((p) => { n = separateLabels(p); });
  toast[changed ? 'success' : 'info'](changed ? `Moved ${n} label${n === 1 ? '' : 's'} apart` : 'No labels overlap');
  return changed;
};
export const runAlignGroups = (mode: 'row' | 'column'): boolean => {
  const changed = commit((p) => { alignGroups(p, mode); });
  if (!changed) toast.info('Groups are already aligned');
  return changed;
};
export type { CNode };

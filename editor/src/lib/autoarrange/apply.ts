/** Auto layout on the live diagram: ONE store transform (one undo step, one batched change for collab), animated by CSS. */
import { useDiagramStore } from '../../store/diagramStore';
import { useSettingsStore } from '../../store/settingsStore';
import { useUiStore } from '../../store/uiStore';
import { toast } from '../../store/toastStore';
import type { DiagramEdge, DiagramNode } from '../../types';
import { styleEdge } from '../graph';
import { arrangeNodes, type ArrangeOptions } from './engine';
import { loadPrefs } from './prefs';

export const ARRANGE_MS = 300;
const reduced = (): boolean => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** briefly let nodes glide (CSS transition on transform) and edges fade in re-routed */
function animate(): void {
  if (reduced()) return;
  const el = document.documentElement;
  el.setAttribute('data-arranging', '');
  window.setTimeout(() => el.removeAttribute('data-arranging'), ARRANGE_MS + 80);
}

export interface RunResult { moved: number; ids: string[] }

/** Compute and commit. `selection: true` limits it to the selected nodes (a lone group: its inside). */
export function runAutoArrange(over: Omit<Partial<ArrangeOptions>, 'selection'> & { selection?: boolean | string[] } = {}): RunResult {
  const st = useDiagramStore.getState();
  const prefs = loadPrefs(st.projectId);
  const { selection, ...rest } = over;
  const picked = selection === true ? st.nodes.filter((n) => n.selected).map((n) => n.id) : Array.isArray(selection) ? selection : undefined;
  const settings = useSettingsStore.getState();
  const grid = settings.global.canvas?.gridSize ?? 20;
  const snap = useUiStore.getState().snap ? grid : 0;
  const opts: Partial<ArrangeOptions> = { algo: prefs.algo, direction: prefs.direction, spacing: prefs.spacing, snap, ...rest, ...(picked?.length ? { selection: picked } : {}) };
  const result = arrangeNodes(st.nodes, st.edges, opts);
  if (!result.size) { toast.info('Already tidy'); return { moved: 0, ids: [] }; }
  animate();
  st.transform((nodes, edges) => {
    const nextNodes: DiagramNode[] = nodes.map((n) => {
      const p = result.get(n.id);
      if (!p) return n;
      const sized = p.width !== undefined && p.height !== undefined;
      return { ...n, position: { x: p.x, y: p.y }, ...(sized ? { width: p.width, height: p.height, style: { ...(n.style ?? {}), width: p.width, height: p.height } } : {}) };
    });
    // edges whose ends moved forget hand-placed bends so the router finds fresh paths
    const nextEdges: DiagramEdge[] = edges.map((e) => {
      if (e.data?.locked || (!result.has(e.source) && !result.has(e.target))) return e;
      const { manual: _m, waypoints: _w, labelT: _t, labelOffset: _o, ...data } = e.data ?? {};
      void _m; void _w; void _t; void _o;
      return styleEdge({ ...e, data });
    });
    return { nodes: nextNodes, edges: nextEdges };
  });
  return { moved: result.size, ids: [...result.keys()] };
}

export function describeScope(): 'selection' | 'group' | 'page' {
  const sel = useDiagramStore.getState().nodes.filter((n) => n.selected);
  if (sel.length === 1 && (sel[0].type === 'group' || sel[0].type === 'cluster')) return 'group';
  return sel.length >= 2 ? 'selection' : 'page';
}

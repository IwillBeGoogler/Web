import { applyFix, type Fix } from '@core/lintFix';
import type { CPage } from '@core/types';
import { useDiagramStore } from '../../store/diagramStore';
import type { DiagramEdge, DiagramNode } from '../../types';
import { finalizeNode } from '../dsl/finalize';
import { styleEdge } from '../graph';
import { activePage } from '../dsl/bridge';
import { withClassSize } from '../uml/geometry';
import { umlEdge } from '../uml/edges';
import { flowRef } from '../board/flowRef';

const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** apply a quick fix to the canvas as ONE undo step; untouched nodes keep their identity */
export function applyFixToStore(fix: Fix): boolean {
  const st = useDiagramStore.getState();
  const next: CPage = applyFix(activePage(), fix);
  return st.transform((ns, es) => {
    const keepN = new Set(next.nodes.map((n) => n.id));
    const keepE = new Set(next.edges.map((e) => e.id));
    const sized = (n: DiagramNode): DiagramNode => (n.type === 'class' ? withClassSize(n) : finalizeNode(n));
    const nodes = ns.filter((n) => keepN.has(n.id)).map((n) => {
      const r = next.nodes.find((x) => x.id === n.id);
      return r && !same(r.data, n.data) ? sized({ ...n, data: r.data } as unknown as DiagramNode) : n;
    });
    const edges = es.filter((e) => keepE.has(e.id)).map((e) => {
      const r = next.edges.find((x) => x.id === e.id);
      return r && !same(r.data, e.data) ? styleEdge({ ...e, data: r.data } as unknown as DiagramEdge) : e;
    });
    const oldN = new Set(ns.map((n) => n.id));
    const oldE = new Set(es.map((e) => e.id));
    for (const r of next.nodes) if (!oldN.has(r.id)) nodes.push(sized(r as unknown as DiagramNode));
    for (const r of next.edges) if (!oldE.has(r.id)) edges.push(r.data?.uml ? umlEdge(r.id, r.source, r.target, r.data.uml) : styleEdge(r as unknown as DiagramEdge));
    return nodes.length === ns.length && edges.length === es.length && nodes.every((n, i) => n === ns[i]) && edges.every((e, i) => e === es[i]) ? null : { nodes, edges };
  });
}

/** select the problem's nodes and zoom to them */
export function showProblem(nodeIds: string[], edgeIds: string[] = []): void {
  if (!nodeIds.length) return;
  const keep = new Set(nodeIds);
  const ek = new Set(edgeIds);
  useDiagramStore.setState((s) => ({ nodes: s.nodes.map((n) => (!!n.selected === keep.has(n.id) ? n : { ...n, selected: keep.has(n.id) })), edges: s.edges.map((e) => (!!e.selected === ek.has(e.id) ? e : { ...e, selected: ek.has(e.id) })) }));
  void flowRef.current?.fitView({ nodes: nodeIds.map((id) => ({ id })), duration: 350, padding: 0.5, maxZoom: 1.5 });
}

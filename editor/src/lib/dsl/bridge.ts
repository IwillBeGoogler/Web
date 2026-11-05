/**
 * Glue between the diagrams-as-code text (`@core/dsl`) and the editor store. Text -> canvas goes through ONE `transform` (one undo
 * step) that keeps the object identity of untouched nodes; canvas -> text is a pure print of the active page.
 */
import { applyDsl, printPage, type Diagnostic } from '@core/dsl';
import type { CEdge, CNode, CPage } from '@core/types';
import { useDiagramStore } from '../../store/diagramStore';
import type { DiagramEdge, DiagramNode } from '../../types';
import { sortParentsFirst, styleEdge } from '../graph';
import { finalizeNode } from './finalize';

export function activePage(): CPage {
  const s = useDiagramStore.getState();
  const name = s.pages.find((p) => p.id === s.activePageId)?.name ?? 'Page 1';
  return { id: s.activePageId, name, nodes: s.nodes as unknown as CNode[], edges: s.edges as unknown as CEdge[] };
}

/** canonical text of the canvas */
export const storeText = (): string => {
  const p = activePage();
  return printPage(p, p.name);
};

export interface ApplyReport { diagnostics: Diagnostic[]; applied: boolean; added: string[]; removed: string[] }

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/**
 * Parse `text` and merge it into the canvas. Syntax errors never touch the canvas (they come back as diagnostics, with line and
 * column, for the editor); warnings (unknown icon) are applied.
 */
export function applyText(text: string, opts: { force?: boolean; dryRun?: boolean } = {}): ApplyReport {
  const st = useDiagramStore.getState();
  const result = applyDsl(activePage(), text);
  const errors = result.diagnostics.filter((d) => d.severity === 'error');
  if (opts.dryRun || (errors.length && !opts.force)) return { diagnostics: result.diagnostics, applied: false, added: [], removed: [] };
  const prevNodes = new Map(st.nodes.map((n) => [n.id, n]));
  const prevEdges = new Map(st.edges.map((e) => [e.id, e]));
  const changed = st.transform((ns, es) => {
    const nodes = result.page.nodes.map((r) => {
      const p = prevNodes.get(r.id);
      if (p && same(p, r)) return p;
      return finalizeNode(r as unknown as DiagramNode);
    });
    const edges = result.page.edges.map((r) => {
      const p = prevEdges.get(r.id);
      if (p && same(p, r)) return p;
      return styleEdge(r as unknown as DiagramEdge);
    });
    const sorted = sortParentsFirst(nodes);
    if (sorted.length === ns.length && edges.length === es.length && sorted.every((n, i) => n === ns[i]) && edges.every((e, i) => e === es[i])) return null;
    return { nodes: sorted, edges };
  });
  return { diagnostics: result.diagnostics, applied: changed, added: result.added, removed: result.removed };
}

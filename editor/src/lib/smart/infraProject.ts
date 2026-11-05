import type { CPage } from '@core/types';
import type { DiagramContent, DiagramEdge, DiagramNode, Project } from '../../types';
import { finalizeNode } from '../dsl/finalize';
import { sortParentsFirst, styleEdge } from '../graph';
import { createProject } from '../project';

/** a core page as editor nodes and edges (styled for React Flow, sizes finished) */
export function pageToContent(page: CPage): DiagramContent {
  return {
    version: 1,
    nodes: sortParentsFirst(page.nodes.map((n) => finalizeNode(n as unknown as DiagramNode))),
    edges: page.edges.map((e) => styleEdge(e as unknown as DiagramEdge)),
  };
}

/** a one-page project holding the page (what "insert as new file" opens) */
export function pageToProject(page: CPage, name: string): Project {
  const base = createProject(name);
  const content = pageToContent(page);
  return { ...base, pages: [{ ...base.pages[0], name, nodes: content.nodes, edges: content.edges }] };
}

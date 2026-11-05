import { applyDsl, printPage } from '@core/dsl';
import type { CPage } from '@core/types';
import type { Project } from '../../types';
import { finalizeNode } from '../dsl/finalize';
import { styleEdge, sortParentsFirst } from '../graph';
import { createProject } from '../project';
import { SddError, sourceText } from './sdd';
import type { DiagramEdge, DiagramNode } from '../../types';

/** text `.sdd` -> a new one-page project (auto-layout for every node: the text carries no coordinates). Throws SddError('schema') with line numbers on syntax errors. */
export function textToProject(text: string, fallbackName = 'Imported text'): { project: Project; warnings: string[] } {
  const r = applyDsl(undefined, text);
  const errors = r.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length) {
    const shown = errors.slice(0, 3).map((d) => `line ${d.line}: ${d.message}`).join('; ');
    throw new SddError('schema', `${shown}${errors.length > 3 ? ` (+${errors.length - 3} more)` : ''}`, 'text');
  }
  const title = /^diagram\s+"((?:[^"\\]|\\.)*)"/m.exec(text)?.[1] ?? fallbackName;
  const base = createProject(title);
  const page = {
    ...base.pages[0],
    name: title,
    nodes: sortParentsFirst(r.page.nodes.map((n) => finalizeNode(n as unknown as DiagramNode))),
    edges: r.page.edges.map((e) => styleEdge(e as unknown as DiagramEdge)),
  };
  return { project: { ...base, name: title, pages: [page], activePageId: page.id }, warnings: r.diagnostics.filter((d) => d.severity === 'warning').map((d) => `line ${d.line}: ${d.message}`) };
}

/** the text of a project's first/active page */
export const projectToText = (project: Project): string => sourceText(project);
export { printPage };
export type { CPage };

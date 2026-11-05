import type { Project } from '../../types';
import { cleanDiagram } from '../serialization';

/** Stable string of the saveable content (no selection, viewport, timestamps or transient classes) for dirty tracking. */
export function projectSignature(p: Project): string {
  return JSON.stringify([
    p.id,
    p.name,
    p.settings ?? null,
    p.activePageId,
    p.pages.map((pg) => {
      const c = cleanDiagram({ version: 1, nodes: pg.nodes, edges: pg.edges });
      return [pg.id, pg.name, c.nodes, c.edges, pg.settings ?? null];
    }),
    Object.keys(p.assets ?? {}).sort(),
  ]);
}

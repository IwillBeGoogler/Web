import type { Project } from '../../types';
import { newId } from '../graph';
import { duplicatePages } from '../project';

export type OpenDecision = { kind: 'new' } | { kind: 'conflict'; existingId: string };

/** Opening a .sdd whose projectId already exists asks the user: Replace or Open as copy. */
export function decideOpen(existingIds: string[], project: Project): OpenDecision {
  return existingIds.includes(project.id) ? { kind: 'conflict', existingId: project.id } : { kind: 'new' };
}

export function resolveConflict(project: Project, choice: 'replace' | 'copy'): Project {
  if (choice === 'replace') return project;
  const idx = Math.max(0, project.pages.findIndex((p) => p.id === project.activePageId));
  const pages = duplicatePages(project.pages);
  return { ...structuredClone(project), id: newId('prj'), name: `${project.name} (copy)`, pages, activePageId: pages[idx].id };
}

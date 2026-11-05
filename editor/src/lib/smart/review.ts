import { alignIds } from '@core/diff';
import type { CPage } from '@core/types';
import { api } from '../../api/api';
import type { VersionMeta } from '../../api/types';
import { isServerBacked } from '../../sync/meta';
import { useDiagramStore } from '../../store/diagramStore';
import { loadFile } from '../../workspace/storage';
import { useWorkspace } from '../../workspace/store';
import type { Page, Project } from '../../types';
import { diffProjects, type DocDiff } from '../versionDiff';

export interface CompareTarget { kind: 'file' | 'version'; id: string; name: string }

/** the files of this project (except the open one) and, for server files, its saved versions */
export async function listCompareTargets(): Promise<CompareTarget[]> {
  const ws = useWorkspace.getState();
  const here = useDiagramStore.getState().projectId;
  const out: CompareTarget[] = ws.tree.files.filter((f) => f.id !== here).map((f) => ({ kind: 'file', id: f.id, name: f.name }));
  if (here && isServerBacked(localStorage, here)) {
    try {
      const versions: VersionMeta[] = await api.listVersions(here);
      out.push(...[...versions].sort((a, b) => b.version - a.version).map((v) => ({ kind: 'version' as const, id: String(v.version), name: `Version ${v.version}${v.label ? ` · ${v.label}` : ''}` })));
    } catch {
      /* offline: files only */
    }
  }
  return out;
}

/** the document of another file (server copy when the project is server backed, else the local one) */
export async function loadBaseline(t: CompareTarget): Promise<Project> {
  const here = useDiagramStore.getState().projectId;
  if (t.kind === 'version') return (await api.getVersion(here, Number(t.id))).data;
  if (isServerBacked(localStorage, t.id)) return (await api.getFile(t.id)).file.data;
  const local = loadFile(localStorage, t.id);
  if (!local) throw new Error(`“${t.name}” has no document on this device`);
  return local;
}

const activeOf = (p: Project): Page => p.pages.find((x) => x.id === p.activePageId) ?? p.pages[0];

/**
 * Compare a baseline with the open file. Both sides are reduced to their active page; nodes of the baseline that carry other ids
 * (another file) are matched by type and label, so a copy of the same diagram compares as "no differences".
 */
export function compareWithCurrent(baseline: Project, current: Project): DocDiff {
  const cur = activeOf(current);
  const base = activeOf(baseline);
  const aligned = alignIds(cur as unknown as CPage, base as unknown as CPage) as unknown as Page;
  const one = (p: Project, page: Page): Project => ({ ...p, pages: [{ ...page, id: 'compare' }], activePageId: 'compare' });
  return diffProjects(one(baseline, aligned), one(current, cur));
}

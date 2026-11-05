// Dialog-driven flows (delete / rename / new / duplicate / export / import conflict / leave / apply-to-all).
// Pure data + dialogs: no window.confirm / prompt / alert anywhere.
import { createElement } from 'react';
import { dialogs } from './dialogs';
import { useDiagramStore } from '../store/diagramStore';
import { toast } from '../store/toastStore';
import { ExportForm, NewProjectForm, type ExportChoice, type NewProjectResult } from '../components/dialogs/forms';
import type { DiagramNode } from '../types';

/** selections larger than this need a confirmation */
export const BIG_SELECTION = 10;
/** projects with more files than this need type-to-confirm to delete */
export const TYPE_TO_CONFIRM_PAGES = 3;
export const MAX_NAME = 80;

export const nameError = (v: string): string | null => (!v.trim() ? 'Name is required' : v.trim().length > MAX_NAME ? `Use at most ${MAX_NAME} characters` : null);

export function pageNameError(pages: { id: string; name: string }[], name: string, selfId?: string): string | null {
  const base = nameError(name);
  if (base) return base;
  const n = name.trim().toLowerCase();
  return pages.some((p) => p.id !== selfId && p.name.trim().toLowerCase() === n) ? 'A page with this name already exists' : null;
}

// ---------- pages ----------
export async function renamePageDialog(pageId?: string): Promise<string | null> {
  const st = useDiagramStore.getState();
  const id = pageId ?? st.activePageId;
  const page = st.pages.find((p) => p.id === id);
  if (!page) return null;
  const name = await dialogs.prompt({
    title: 'Rename page',
    label: 'Page name',
    initial: page.name,
    confirmLabel: 'Rename',
    validate: (v) => pageNameError(useDiagramStore.getState().pages, v, id),
  });
  if (name !== null) useDiagramStore.getState().renamePage(id, name);
  return name;
}

export async function deletePageDialog(pageId?: string): Promise<boolean> {
  const st = useDiagramStore.getState();
  const id = pageId ?? st.activePageId;
  const page = st.pages.find((p) => p.id === id);
  if (!page) return false;
  if (st.pages.length <= 1) {
    toast.info('A project needs at least one page');
    return false;
  }
  const ok = await dialogs.confirm({ title: `Delete page “${page.name}”?`, message: 'The page and everything on it will be removed.', confirmLabel: 'Delete page', danger: true });
  return ok ? useDiagramStore.getState().deletePage(id) : false;
}

// ---------- projects ----------
export async function deleteProjectDialog(name: string, fileCount: number): Promise<boolean> {
  const big = fileCount > TYPE_TO_CONFIRM_PAGES;
  return dialogs.confirm({
    title: `Delete project “${name}”?`,
    message: big ? `This project has ${fileCount} files. Deleting it cannot be undone.` : 'The project and all its files will be removed from this browser.',
    confirmLabel: 'Delete project',
    danger: true,
    ...(big ? { typeToConfirm: name } : {}),
  });
}

export const renameProjectDialog = (current: string): Promise<string | null> =>
  dialogs.prompt({ title: 'Rename project', label: 'Project name', initial: current, confirmLabel: 'Rename', validate: nameError });

export const duplicateProjectDialog = (name: string): Promise<string | null> =>
  dialogs.prompt({ title: 'Duplicate project', label: 'Name of the copy', initial: `${name} (copy)`, confirmLabel: 'Duplicate', validate: nameError });

export const newProjectDialog = (templates: { id: string; name: string }[]): Promise<NewProjectResult | null> =>
  dialogs.custom<NewProjectResult>({ title: 'New project', render: (api) => createElement(NewProjectForm, { ...api, templates }) });

// ---------- groups / clusters ----------
export async function renameGroupDialog(nodeId: string): Promise<string | null> {
  const n = useDiagramStore.getState().nodes.find((x) => x.id === nodeId);
  if (!n) return null;
  const kind = n.type === 'cluster' ? 'cluster' : 'group';
  const name = await dialogs.prompt({ title: `Rename ${kind}`, label: `${kind === 'cluster' ? 'Cluster' : 'Group'} name`, initial: String(n.data.label ?? ''), confirmLabel: 'Rename', validate: nameError });
  if (name !== null) useDiagramStore.getState().updateNodeData(nodeId, { label: name });
  return name;
}

// ---------- delete (groups + big selections) ----------
export interface DeleteTarget {
  nodes?: string[];
  edges?: string[];
}
/** what a delete request would touch, and whether it needs a dialog */
export function planDelete(nodes: DiagramNode[], selectedNodes: string[], selectedEdges: string[]): { groups: DiagramNode[]; count: number } {
  const sel = new Set(selectedNodes);
  const groups = nodes.filter((n) => sel.has(n.id) && (n.type === 'group' || n.type === 'cluster') && nodes.some((c) => c.parentId === n.id && !sel.has(c.id)));
  return { groups, count: selectedNodes.length + selectedEdges.length };
}

/** Delete with the right confirmation. Returns synchronously handled = true when no dialog was needed. */
export function requestDelete(target: DeleteTarget | undefined, run: (t: DeleteTarget | undefined) => number, afterKept: (kept: number) => void): void {
  const st = useDiagramStore.getState();
  const nIds = target?.nodes ?? (target?.edges ? [] : st.nodes.filter((n) => n.selected).map((n) => n.id));
  const eIds = target?.edges ?? (target?.nodes ? [] : st.edges.filter((e) => e.selected).map((e) => e.id));
  const { groups, count } = planDelete(st.nodes, nIds, eIds);
  if (!groups.length && count <= BIG_SELECTION) return afterKept(run(target));
  void (async () => {
    let t: DeleteTarget = { nodes: nIds, edges: eIds };
    if (groups.length) {
      const inside = groups.reduce((n, g) => n + st.nodes.filter((c) => c.parentId === g.id).length, 0);
      const label = groups.length === 1 ? `“${String(groups[0].data.label || (groups[0].type === 'cluster' ? 'cluster' : 'group'))}”` : `${groups.length} groups`;
      const pick = await dialogs.choose<'only' | 'all'>({
        title: groups.length === 1 ? `Delete ${groups[0].type === 'cluster' ? 'cluster' : 'group'} ${label}?` : `Delete ${label}?`,
        message: `It contains ${inside} item${inside === 1 ? '' : 's'}. Keep them on the canvas, or delete them too?`,
        choices: [
          { value: 'only', label: groups.length === 1 ? 'Delete group only' : 'Delete groups only' },
          { value: 'all', label: 'Delete with children', variant: 'danger' },
        ],
      });
      if (!pick) return;
      if (pick === 'only') {
        for (const g of groups) useDiagramStore.getState().ungroup(g.id);
        const gone = new Set(groups.map((g) => g.id));
        t = { nodes: nIds.filter((id) => !gone.has(id)), edges: eIds };
        if (!t.nodes!.length && !t.edges!.length) return;
        if (t.nodes!.length + t.edges!.length <= BIG_SELECTION) return afterKept(run(t));
      }
    }
    if (t.nodes!.length + t.edges!.length > BIG_SELECTION) {
      const n = t.nodes!.length + t.edges!.length;
      const ok = await dialogs.confirm({ title: `Delete ${n} items?`, message: 'The whole selection will be removed. You can undo with Ctrl+Z.', confirmLabel: `Delete ${n} items`, danger: true });
      if (!ok) return;
    }
    afterKept(run(t));
  })();
}

// ---------- import / leave / apply ----------
export const importConflictDialog = (fileName: string): Promise<'replace' | 'copy' | null> =>
  dialogs.choose<'replace' | 'copy'>({
    title: 'File already exists',
    message: `A file “${fileName}” with the same id already exists in this browser. Replace it, or open the new one as a copy?`,
    choices: [
      { value: 'copy', label: 'Open as copy', variant: 'primary' },
      { value: 'replace', label: 'Replace', variant: 'danger' },
    ],
  });

export const leaveDialog = (): Promise<'save' | 'discard' | null> =>
  dialogs.choose<'save' | 'discard'>({
    title: 'Unsaved changes',
    message: 'This file has changes that are not saved to its .sdd file. Leaving now keeps the browser copy, but the file stays outdated.',
    choices: [
      { value: 'save', label: 'Save and leave', variant: 'primary' },
      { value: 'discard', label: 'Leave without saving', variant: 'danger' },
    ],
    cancelLabel: 'Stay',
  });

export const confirmApply = (title: string, message: string, confirmLabel = 'Apply'): Promise<boolean> => dialogs.confirm({ title, message, confirmLabel });

// ---------- export ----------
export const exportDialog = (initial: ExportChoice, pageCount: number): Promise<ExportChoice | null> =>
  dialogs.custom<ExportChoice>({ title: 'Export', render: (api) => createElement(ExportForm, { ...api, initial, pageCount }) });

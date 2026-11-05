import type { EntryRef, ProjectTree } from './types';
import { findEntry, isDescendantFolder, moveEntry, parentOf, siblings, type MoveResult } from './tree';

/** where in a row the pointer is: top edge = before it, bottom edge = after it, middle of a FOLDER = inside it */
export type DropZone = 'before' | 'inside' | 'after';

/** `frac` = pointer y within the row, 0 (top) .. 1 (bottom) */
export function zoneAt(frac: number, isFolder: boolean): DropZone {
  if (isFolder) return frac < 0.25 ? 'before' : frac > 0.75 ? 'after' : 'inside';
  return frac < 0.5 ? 'before' : 'after';
}

export type DropPlan = { ok: true; parentId: string | null; index: number } | { ok: false; reason: 'self' | 'cycle' | 'missing' | 'noop' };

/**
 * Turn "dragged onto target (zone)" into a (parent, index) pair. `target` null = the empty area below the tree (project root, at the end).
 * A folder cannot be dropped into itself or one of its descendants.
 */
export function planDrop(tree: ProjectTree, dragged: EntryRef, target: EntryRef | null, zone: DropZone): DropPlan {
  const d = findEntry(tree, dragged);
  if (!d) return { ok: false, reason: 'missing' };
  let parentId: string | null;
  let index: number;
  if (target === null) {
    parentId = null;
    index = siblings(tree, null).filter((s) => !(s.kind === dragged.kind && s.id === dragged.id)).length;
  } else {
    if (target.kind === dragged.kind && target.id === dragged.id) return { ok: false, reason: 'self' };
    const t = findEntry(tree, target);
    if (!t) return { ok: false, reason: 'missing' };
    if (zone === 'inside' && t.kind === 'folder') {
      parentId = t.id;
      index = siblings(tree, t.id).filter((s) => !(s.kind === dragged.kind && s.id === dragged.id)).length;
    } else {
      parentId = parentOf(t);
      const others = siblings(tree, parentId).filter((s) => !(s.kind === dragged.kind && s.id === dragged.id));
      index = others.findIndex((s) => s.kind === t.kind && s.id === t.id) + (zone === 'after' ? 1 : 0);
    }
  }
  if (dragged.kind === 'folder' && isDescendantFolder(tree, dragged.id, parentId)) return { ok: false, reason: 'cycle' };
  const probe = moveEntry(tree, dragged, parentId, index);
  if (!probe.ok) return { ok: false, reason: probe.reason };
  return { ok: true, parentId, index };
}

export const applyDrop = (tree: ProjectTree, dragged: EntryRef, plan: Extract<DropPlan, { ok: true }>): MoveResult => moveEntry(tree, dragged, plan.parentId, plan.index);

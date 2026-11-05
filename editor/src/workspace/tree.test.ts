import { describe, expect, it } from 'vitest';
import type { ProjectTree } from './types';
import { ancestorFolderIds, countFolder, createFile, createFolder, deleteEntry, dominantKind, duplicateEntry, filterTree, flatten, folderSubtree, isDescendantFolder, moveEntry, nameProblem, pathOf, positionBetween, renameEntry, siblings, uniqueName } from './tree';

const NOW = 1000;
const build = (): ProjectTree => {
  let t: ProjectTree = { folders: [], files: [] };
  t = createFolder(t, { id: 'a', name: 'a', parentId: null });
  t = createFolder(t, { id: 'b', name: 'b', parentId: 'a' });
  t = createFolder(t, { id: 'c', name: 'c', parentId: 'b' });
  t = createFile(t, { id: 'f1', name: 'one', folderId: null, now: NOW });
  t = createFile(t, { id: 'f2', name: 'two', folderId: 'a', now: NOW });
  t = createFile(t, { id: 'f3', name: 'three', folderId: 'c', now: NOW });
  return t;
};
const names = (t: ProjectTree, p: string | null) => siblings(t, p).map((e) => e.name);
let n = 0;
const ids = (prefix: string) => `${prefix}_new${++n}`;

describe('create', () => {
  it('appends in order, folders and files in one sequence', () => {
    const t = build();
    expect(names(t, null)).toEqual(['a', 'one']);
    expect(names(createFile(t, { id: 'x', name: 'x', folderId: null, now: NOW }), null)).toEqual(['a', 'one', 'x']);
  });
  it('ignores an unknown parent and duplicate ids', () => {
    const t = build();
    expect(createFolder(t, { id: 'z', name: 'z', parentId: 'ghost' })).toBe(t);
    expect(createFile(t, { id: 'f1', name: 'dup', folderId: null, now: NOW })).toBe(t);
    expect(createFolder(t, { id: 'a', name: 'dup', parentId: null })).toBe(t);
    expect(createFile(t, { id: 'q', name: 'q', folderId: 'ghost', now: NOW })).toBe(t);
  });
});

describe('rename', () => {
  it('renames folders and files, ignores blank names', () => {
    const t = build();
    expect(renameEntry(t, { kind: 'folder', id: 'a' }, '  alpha ').folders.find((f) => f.id === 'a')!.name).toBe('alpha');
    expect(renameEntry(t, { kind: 'file', id: 'f1' }, 'uno', 5).files.find((f) => f.id === 'f1')).toMatchObject({ name: 'uno', updatedAt: 5 });
    expect(renameEntry(t, { kind: 'file', id: 'f1' }, '   ')).toBe(t);
  });
});

describe('move + cycle prevention + ordering', () => {
  it('cannot move a folder into itself or a descendant', () => {
    const t = build();
    for (const target of ['a', 'b', 'c']) expect(moveEntry(t, { kind: 'folder', id: 'a' }, target)).toEqual({ ok: false, reason: 'cycle' });
    expect(moveEntry(t, { kind: 'folder', id: 'b' }, 'c')).toEqual({ ok: false, reason: 'cycle' });
    expect(isDescendantFolder(t, 'a', 'c')).toBe(true);
    expect(isDescendantFolder(t, 'c', 'a')).toBe(false);
  });
  it('moves a folder with its whole subtree', () => {
    const r = moveEntry(build(), { kind: 'folder', id: 'b' }, null);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.tree.folders.find((f) => f.id === 'b')!.parentId).toBeNull();
    expect(folderSubtree(r.tree, 'b')).toEqual(new Set(['b', 'c']));
    expect(r.tree.files.find((f) => f.id === 'f3')!.folderId).toBe('c');
  });
  it('moves a file to a folder at a given index, only the moved entry changes', () => {
    let t = build();
    t = createFile(t, { id: 'f4', name: 'four', folderId: 'a', now: NOW });
    const before = JSON.stringify(t.files.filter((f) => f.id !== 'f1'));
    const r = moveEntry(t, { kind: 'file', id: 'f1' }, 'a', 1);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(names(r.tree, 'a')).toEqual(['b', 'one', 'two', 'four']);
    expect(JSON.stringify(r.tree.files.filter((f) => f.id !== 'f1'))).toBe(before);
  });
  it('reorders within the same parent (before/after), and no-ops when nothing changes', () => {
    const t = build();
    const r = moveEntry(t, { kind: 'file', id: 'f1' }, null, 0);
    expect(r.ok && names(r.tree, null)).toEqual(['one', 'a']);
    expect(moveEntry(t, { kind: 'file', id: 'f1' }, null, 1)).toEqual({ ok: false, reason: 'noop' });
    expect(moveEntry(t, { kind: 'file', id: 'ghost' }, null)).toEqual({ ok: false, reason: 'missing' });
    expect(moveEntry(t, { kind: 'file', id: 'f1' }, 'ghost')).toEqual({ ok: false, reason: 'missing' });
  });
  it('repeated reordering keeps a stable total order (fractional positions)', () => {
    let t: ProjectTree = { folders: [], files: [] };
    for (const x of 'abcde') t = createFile(t, { id: x, name: x, folderId: null, now: NOW });
    const order = ['e', 'c', 'a', 'd', 'b'];
    for (const x of order) {
      const r = moveEntry(t, { kind: 'file', id: x }, null, 0);
      if (r.ok) t = r.tree;
    }
    expect(names(t, null)).toEqual([...order].reverse());
  });
  it('legacy siblings with equal positions are renumbered so a drop lands where asked', () => {
    const t: ProjectTree = { folders: [], files: ['a', 'b', 'c'].map((x) => ({ id: x, folderId: null, name: x, kind: 'sdd' as const, position: 0, createdAt: 0, updatedAt: 0, pageCount: 1 })) };
    const r = moveEntry({ ...t, files: [...t.files, { ...t.files[0], id: 'd', name: 'd' }] }, { kind: 'file', id: 'd' }, null, 1);
    expect(r.ok && names(r.tree, null)).toEqual(['a', 'd', 'b', 'c']);
  });
  it('positionBetween', () => {
    expect(positionBetween(undefined, undefined)).toBe(0);
    expect(positionBetween(undefined, 3)).toBe(2);
    expect(positionBetween(3, undefined)).toBe(4);
    expect(positionBetween(1, 2)).toBe(1.5);
  });
});

describe('delete', () => {
  it('removes a file', () => {
    const r = deleteEntry(build(), { kind: 'file', id: 'f1' });
    expect(r.removedFiles).toEqual(['f1']);
    expect(r.tree.files.some((f) => f.id === 'f1')).toBe(false);
  });
  it('removes a folder with every descendant and reports what went', () => {
    const t = build();
    expect(countFolder(t, 'a')).toEqual({ folders: 2, files: 2 });
    const r = deleteEntry(t, { kind: 'folder', id: 'a' });
    expect(new Set(r.removedFolders)).toEqual(new Set(['a', 'b', 'c']));
    expect(new Set(r.removedFiles)).toEqual(new Set(['f2', 'f3']));
    expect(r.tree.folders).toEqual([]);
    expect(r.tree.files.map((f) => f.id)).toEqual(['f1']);
  });
  it('unknown ids change nothing', () => {
    const t = build();
    expect(deleteEntry(t, { kind: 'folder', id: 'ghost' }).tree).toBe(t);
    expect(deleteEntry(t, { kind: 'file', id: 'ghost' }).removedFiles).toEqual([]);
  });
});

describe('duplicate', () => {
  it('copies a file next to the original with a unique name', () => {
    const r = duplicateEntry(build(), { kind: 'file', id: 'f1' }, ids, NOW)!;
    expect(r.fileMap).toEqual({ f1: r.root.id });
    expect(names(r.tree, null)).toEqual(['a', 'one', 'one (copy)']);
    const again = duplicateEntry(r.tree, { kind: 'file', id: 'f1' }, ids, NOW)!;
    expect(names(again.tree, null)).toEqual(['a', 'one', 'one (copy)', 'one (copy) (2)']);
  });
  it('deep-copies a folder: new ids everywhere, structure and kinds kept, original untouched', () => {
    const t = build();
    const r = duplicateEntry(t, { kind: 'folder', id: 'a' }, ids, NOW)!;
    expect(Object.keys(r.folderMap).sort()).toEqual(['a', 'b', 'c']);
    expect(Object.keys(r.fileMap).sort()).toEqual(['f2', 'f3']);
    expect(r.tree.folders).toHaveLength(6);
    expect(r.tree.files).toHaveLength(5);
    const newA = r.tree.folders.find((f) => f.id === r.root.id)!;
    expect(newA).toMatchObject({ name: 'a (copy)', parentId: null });
    expect(r.tree.folders.find((f) => f.id === r.folderMap.b)!.parentId).toBe(newA.id);
    expect(r.tree.files.find((f) => f.id === r.fileMap.f3)!.folderId).toBe(r.folderMap.c);
    expect(new Set([...r.tree.folders.map((f) => f.id), ...r.tree.files.map((f) => f.id)]).size).toBe(11);
    expect(r.tree.folders.find((f) => f.id === 'a')!.name).toBe('a');
  });
  it('keeps the diagram kind of copied files', () => {
    const t = { folders: [], files: [{ id: 'x', folderId: null, name: 'x', kind: 'erd' as const, position: 0, createdAt: 0, updatedAt: 0, pageCount: 2 }] };
    const r = duplicateEntry(t, { kind: 'file', id: 'x' }, ids, NOW)!;
    expect(r.tree.files.find((f) => f.id === r.root.id)).toMatchObject({ kind: 'erd', pageCount: 2 });
  });
  it('unknown entries give null', () => expect(duplicateEntry(build(), { kind: 'file', id: 'x' }, ids, NOW)).toBeNull());
});

describe('names', () => {
  it('uniqueName / nameProblem are case-insensitive among siblings', () => {
    const t = build();
    expect(uniqueName(t, null, 'ONE')).toBe('ONE (2)');
    expect(uniqueName(t, null, 'fresh')).toBe('fresh');
    expect(uniqueName(t, null, 'one', 'f1')).toBe('one');
    expect(nameProblem(t, null, 'One')).toMatch(/already exists/);
    expect(nameProblem(t, null, 'One', 'f1')).toBeNull();
    expect(nameProblem(t, null, '')).toMatch(/required/);
    expect(nameProblem(t, null, 'a/b')).toMatch(/cannot contain/);
    expect(nameProblem(t, null, 'x'.repeat(121))).toMatch(/at most/);
  });
});

describe('flatten / filter / path', () => {
  it('shows only expanded folders', () => {
    const t = build();
    expect(flatten(t, new Set()).map((r) => r.ref.id)).toEqual(['a', 'f1']);
    const rows = flatten(t, new Set(['a', 'b']));
    expect(rows.map((r) => [r.ref.id, r.depth])).toEqual([['a', 0], ['b', 1], ['c', 2], ['f2', 1], ['f1', 0]]);
  });
  it('rows know depth, parent and children', () => {
    const rows = flatten(build(), new Set(['a', 'b', 'c']));
    const c = rows.find((r) => r.ref.id === 'c')!;
    expect(c).toMatchObject({ depth: 2, parentId: 'b', hasChildren: true, expanded: true });
    expect(rows.find((r) => r.ref.id === 'f1')).toMatchObject({ depth: 0, hasChildren: false });
  });
  it('a filter keeps matches, their ancestors and (for folder matches) their contents; it expands everything', () => {
    const t = build();
    const v = filterTree(t, 'three')!;
    expect(v).toEqual(new Set(['f3', 'c', 'b', 'a']));
    expect(flatten(t, new Set(), v).map((r) => r.ref.id)).toEqual(['a', 'b', 'c', 'f3']);
    expect(filterTree(t, 'b')).toEqual(new Set(['b', 'c', 'f3', 'a']));
    expect(filterTree(t, '  ')).toBeNull();
    expect(filterTree(t, 'zzz')).toEqual(new Set());
  });
  it('ancestors and paths', () => {
    const t = build();
    expect(ancestorFolderIds(t, { kind: 'file', id: 'f3' })).toEqual(['c', 'b', 'a']);
    expect(pathOf(t, { kind: 'file', id: 'f3' })).toBe('a / b / c / three');
    expect(pathOf(t, { kind: 'file', id: 'ghost' })).toBe('');
  });
});

describe('dominantKind', () => {
  const pg = (types: string[]) => ({ nodes: types.map((type) => ({ type })) });
  it('majority wins, ties and empty files are sdd', () => {
    expect(dominantKind([pg([])])).toBe('sdd');
    expect(dominantKind([pg(['icon', 'icon', 'sticky'])])).toBe('sdd');
    expect(dominantKind([pg(['sticky', 'draw', 'icon'])])).toBe('board');
    expect(dominantKind([pg(['frame', 'mindmap', 'stamp', 'icon'])])).toBe('board');
    expect(dominantKind([pg(['erd-table', 'erd-table', 'icon']), pg(['erd-table'])])).toBe('erd');
    expect(dominantKind([pg(['uml-class', 'uml-class', 'icon'])])).toBe('uml');
    expect(dominantKind([pg(['icon', 'sticky'])])).toBe('sdd');
  });
  it('UML-only group variants (package, composite, boundary, lane) count as UML; a plain group does not', () => {
    const grp = (variant?: string) => ({ type: 'group', data: { variant } });
    expect(dominantKind([{ nodes: [grp('package'), grp('package'), { type: 'class' }, { type: 'icon' }] }])).toBe('uml');
    expect(dominantKind([{ nodes: [grp('lane'), grp('composite'), grp('boundary')] }])).toBe('uml');
    expect(dominantKind([{ nodes: [grp('card'), grp(), { type: 'class' }] }])).toBe('sdd');
  });
});

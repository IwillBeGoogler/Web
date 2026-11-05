import { describe, expect, it } from 'vitest';
import type { ProjectTree } from './types';
import { applyDrop, planDrop, zoneAt } from './dnd';
import { createFile, createFolder, siblings } from './tree';

const tree = (): ProjectTree => {
  let t: ProjectTree = { folders: [], files: [] };
  t = createFolder(t, { id: 'a', name: 'a', parentId: null });
  t = createFolder(t, { id: 'b', name: 'b', parentId: 'a' });
  t = createFile(t, { id: 'f1', name: 'f1', folderId: null, now: 0 });
  t = createFile(t, { id: 'f2', name: 'f2', folderId: null, now: 0 });
  t = createFile(t, { id: 'f3', name: 'f3', folderId: 'a', now: 0 });
  return t;
};
const order = (t: ProjectTree, p: string | null) => siblings(t, p).map((e) => e.id);
const F = (id: string) => ({ kind: 'file' as const, id });
const D = (id: string) => ({ kind: 'folder' as const, id });

describe('zoneAt', () => {
  it('folders have a middle "inside" zone, files only before/after', () => {
    expect([zoneAt(0.1, true), zoneAt(0.5, true), zoneAt(0.9, true)]).toEqual(['before', 'inside', 'after']);
    expect([zoneAt(0.1, false), zoneAt(0.49, false), zoneAt(0.5, false), zoneAt(0.9, false)]).toEqual(['before', 'before', 'after', 'after']);
  });
});

describe('planDrop', () => {
  it('drop a file inside a folder appends it there', () => {
    const t = tree();
    const p = planDrop(t, F('f1'), D('a'), 'inside');
    expect(p).toEqual({ ok: true, parentId: 'a', index: 2 });
    const r = applyDrop(t, F('f1'), p as never);
    expect(r.ok && order(r.tree, 'a')).toEqual(['b', 'f3', 'f1']);
  });
  it('drop before / after a sibling reorders', () => {
    const t = tree();
    const before = planDrop(t, F('f2'), F('f1'), 'before');
    expect(before).toEqual({ ok: true, parentId: null, index: 1 });
    const r = applyDrop(t, F('f2'), before as never);
    expect(r.ok && order(r.tree, null)).toEqual(['a', 'f2', 'f1']);
    const after = planDrop(t, F('f1'), F('f2'), 'after');
    expect(after).toEqual({ ok: true, parentId: null, index: 2 });
    expect(planDrop(t, F('f2'), F('f1'), 'after')).toEqual({ ok: false, reason: 'noop' });
  });
  it('drop on a file row in another folder moves to that folder next to it', () => {
    const t = tree();
    const p = planDrop(t, F('f1'), F('f3'), 'after');
    expect(p).toEqual({ ok: true, parentId: 'a', index: 2 });
  });
  it('"inside" on a file row falls back to before/after of its parent', () => {
    const p = planDrop(tree(), F('f1'), F('f3'), 'inside');
    expect(p.ok && p.parentId).toBe('a');
  });
  it('never drops a folder into itself or a descendant', () => {
    const t = tree();
    expect(planDrop(t, D('a'), D('a'), 'inside')).toEqual({ ok: false, reason: 'self' });
    expect(planDrop(t, D('a'), D('b'), 'inside')).toEqual({ ok: false, reason: 'cycle' });
    expect(planDrop(t, D('a'), F('f3'), 'after')).toEqual({ ok: false, reason: 'cycle' }); // f3 lives inside a
    expect(planDrop(t, D('a'), D('b'), 'before')).toEqual({ ok: false, reason: 'cycle' });
    expect(planDrop(t, D('b'), D('a'), 'after')).toEqual({ ok: true, parentId: null, index: 1 });
  });
  it('drop on the empty area moves to the end of the root', () => {
    const t = tree();
    const p = planDrop(t, F('f3'), null, 'inside');
    expect(p).toEqual({ ok: true, parentId: null, index: 3 });
    const r = applyDrop(t, F('f3'), p as never);
    expect(r.ok && order(r.tree, null)).toEqual(['a', 'f1', 'f2', 'f3']);
  });
  it('missing entries', () => {
    expect(planDrop(tree(), F('ghost'), D('a'), 'inside')).toEqual({ ok: false, reason: 'missing' });
    expect(planDrop(tree(), F('f1'), D('ghost'), 'inside')).toEqual({ ok: false, reason: 'missing' });
  });
});

import { describe, expect, it } from 'vitest';
import { createFile, createFolder, flatten } from './tree';
import { navigate } from './nav';
import type { ProjectTree } from './types';

const tree = (): ProjectTree => {
  let t: ProjectTree = { folders: [], files: [] };
  t = createFolder(t, { id: 'a', name: 'a', parentId: null });
  t = createFile(t, { id: 'f2', name: 'f2', folderId: 'a', now: 0 });
  t = createFile(t, { id: 'f1', name: 'f1', folderId: null, now: 0 });
  return t;
};
const rows = (open: string[]) => flatten(tree(), new Set(open));

describe('explorer keyboard navigation', () => {
  it('arrow down/up move through the visible rows and clamp at the ends', () => {
    expect(navigate(rows(['a']), 'a', 'ArrowDown').focus).toBe('f2');
    expect(navigate(rows(['a']), 'f1', 'ArrowDown').focus).toBe('f1');
    expect(navigate(rows(['a']), 'f2', 'ArrowUp').focus).toBe('a');
    expect(navigate(rows(['a']), 'a', 'ArrowUp').focus).toBe('a');
  });
  it('with nothing focused, down goes to the first and up to the last row', () => {
    expect(navigate(rows([]), null, 'ArrowDown').focus).toBe('a');
    expect(navigate(rows([]), null, 'ArrowUp').focus).toBe('f1');
  });
  it('Home / End', () => {
    expect(navigate(rows(['a']), 'f2', 'Home').focus).toBe('a');
    expect(navigate(rows(['a']), 'a', 'End').focus).toBe('f1');
  });
  it('right expands a closed folder, then enters it; left collapses, then goes to the parent', () => {
    expect(navigate(rows([]), 'a', 'ArrowRight')).toEqual({ focus: 'a', toggle: { id: 'a', open: true } });
    expect(navigate(rows(['a']), 'a', 'ArrowRight').focus).toBe('f2');
    expect(navigate(rows(['a']), 'a', 'ArrowLeft')).toEqual({ focus: 'a', toggle: { id: 'a', open: false } });
    expect(navigate(rows(['a']), 'f2', 'ArrowLeft').focus).toBe('a');
    expect(navigate(rows([]), 'f1', 'ArrowLeft').focus).toBe('f1');
    expect(navigate(rows([]), 'f1', 'ArrowRight').focus).toBe('f1');
  });
  it('Enter opens a file and toggles a folder', () => {
    expect(navigate(rows([]), 'f1', 'Enter')).toEqual({ focus: 'f1', open: 'f1' });
    expect(navigate(rows([]), 'a', 'Enter')).toEqual({ focus: 'a', toggle: { id: 'a', open: true } });
    expect(navigate(rows(['a']), 'a', 'Enter')).toEqual({ focus: 'a', toggle: { id: 'a', open: false } });
  });
  it('empty tree', () => expect(navigate([], null, 'ArrowDown').focus).toBeNull());
});

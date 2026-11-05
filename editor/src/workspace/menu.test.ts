import { describe, expect, it } from 'vitest';
import { explorerMenu, tabMenu } from './menu';

const ids = (items: { id: string; separator?: boolean }[]) => items.filter((i) => !i.separator).map((i) => i.id);
const c = { canEdit: true, starred: false, isOpen: false };

describe('explorer context menu', () => {
  it('file: open, star, rename, duplicate, delete (danger)', () => {
    const m = explorerMenu({ kind: 'file', id: 'f' }, c);
    expect(ids(m)).toEqual(['open', 'open-background', 'star', 'rename', 'duplicate', 'delete']);
    expect(m.find((i) => i.id === 'delete')?.danger).toBe(true);
  });
  it('an open file offers "Go to tab", starred files offer to unstar', () => {
    const m = explorerMenu({ kind: 'file', id: 'f' }, { ...c, isOpen: true, starred: true });
    expect(ids(m)).toEqual(['open', 'unstar', 'rename', 'duplicate', 'delete']);
    expect(m[0].label).toBe('Go to tab');
  });
  it('folder: new file/folder, rename, duplicate, delete', () => {
    expect(ids(explorerMenu({ kind: 'folder', id: 'd' }, c))).toEqual(['new-file', 'new-folder', 'rename', 'duplicate', 'delete']);
  });
  it('empty area: create only', () => expect(ids(explorerMenu(null, c))).toEqual(['new-file', 'new-folder']));
  it('viewers get read-only entries', () => {
    const v = { ...c, canEdit: false };
    expect(ids(explorerMenu({ kind: 'file', id: 'f' }, v))).toEqual(['open', 'open-background', 'star']);
    expect(explorerMenu({ kind: 'folder', id: 'd' }, v)).toEqual([]);
    expect(explorerMenu(null, v)).toEqual([]);
  });
});

describe('tab context menu', () => {
  it('close others is disabled with a single tab; rename needs edit rights', () => {
    expect(tabMenu({ canEdit: true, starred: false, count: 1 }).find((i) => i.id === 'close-others')?.disabled).toBe(true);
    expect(ids(tabMenu({ canEdit: false, starred: true, count: 3 }))).toEqual(['close', 'close-others', 'reveal', 'unstar']);
  });
});

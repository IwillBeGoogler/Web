import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('./actions', () => ({ toggleFolder: vi.fn() }));
import { toggleFolder } from './actions';
import { useWorkspace } from './store';
import { expandToFile } from './expand';

const tree = {
  folders: [{ id: 'a', parentId: null }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }],
  files: [{ id: 'f1', folderId: 'c' }, { id: 'root', folderId: null }],
};
beforeEach(() => {
  vi.mocked(toggleFolder).mockClear();
  useWorkspace.setState({ tree: tree as never, expanded: [] } as never);
});

describe('expandToFile', () => {
  it('opens every folder above the file, innermost first', () => {
    expandToFile('f1');
    expect(vi.mocked(toggleFolder).mock.calls).toEqual([['c', true], ['b', true], ['a', true]]);
  });
  it('skips already expanded folders', () => {
    useWorkspace.setState({ expanded: ['b'] } as never);
    expandToFile('f1');
    expect(vi.mocked(toggleFolder).mock.calls.map((c) => c[0])).toEqual(['c', 'a']);
  });
  it('does nothing for root files and unknown ids', () => {
    expandToFile('root');
    expandToFile('ghost');
    expect(toggleFolder).not.toHaveBeenCalled();
  });
});

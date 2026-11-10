import { describe, it, expect, vi, beforeEach } from 'vitest';

const api = vi.hoisted(() => ({ listVersions: vi.fn(), getVersion: vi.fn(), getFile: vi.fn() }));
const isServerBacked = vi.fn();
const loadFile = vi.fn();
vi.mock('../../api/api', () => ({ api }));
vi.mock('../../sync/meta', () => ({ isServerBacked: (...a: unknown[]) => isServerBacked(...a) }));
vi.mock('../../workspace/storage', () => ({ loadFile: (...a: unknown[]) => loadFile(...a) }));
vi.mock('../../workspace/store', () => ({ useWorkspace: { getState: () => ({ tree: { files: [{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }] } }) } }));
vi.mock('../../store/diagramStore', () => ({ useDiagramStore: { getState: () => ({ projectId: 'a' }) } }));

import { listCompareTargets, loadBaseline, compareWithCurrent } from './review';
import type { Project } from '../../types';

beforeEach(() => { vi.clearAllMocks(); isServerBacked.mockReturnValue(false); });

describe('review', () => {
  it('lists other files only when local', async () => {
    expect(await listCompareTargets()).toEqual([{ kind: 'file', id: 'b', name: 'B' }]);
  });
  it('adds versions sorted desc for server file', async () => {
    isServerBacked.mockReturnValue(true);
    api.listVersions.mockResolvedValue([{ version: 1 }, { version: 3, label: 'rel' }]);
    const t = await listCompareTargets();
    expect(t.slice(1)).toEqual([{ kind: 'version', id: '3', name: 'Version 3 · rel' }, { kind: 'version', id: '1', name: 'Version 1' }]);
  });
  it('offline falls back to files', async () => {
    isServerBacked.mockReturnValue(true);
    api.listVersions.mockRejectedValue(new Error('off'));
    expect(await listCompareTargets()).toHaveLength(1);
  });
  it('loadBaseline: version, server file, local, missing', async () => {
    api.getVersion.mockResolvedValue({ data: 'V' });
    expect(await loadBaseline({ kind: 'version', id: '2', name: 'v' })).toBe('V');
    expect(api.getVersion).toHaveBeenCalledWith('a', 2);
    isServerBacked.mockReturnValue(true);
    api.getFile.mockResolvedValue({ file: { data: 'F' } });
    expect(await loadBaseline({ kind: 'file', id: 'b', name: 'B' })).toBe('F');
    isServerBacked.mockReturnValue(false);
    loadFile.mockReturnValueOnce('L');
    expect(await loadBaseline({ kind: 'file', id: 'b', name: 'B' })).toBe('L');
    loadFile.mockReturnValueOnce(null);
    await expect(loadBaseline({ kind: 'file', id: 'b', name: 'B' })).rejects.toThrow(/no document/);
  });
  it('compareWithCurrent: same diagram no changes, falls back to first page', () => {
    const node = (id: string, label: string) => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label } });
    const mk = (id: string, label: string, active = 'p'): Project => ({ pages: [{ id: 'p', name: 'P', nodes: [node(id, label)], edges: [] }], activePageId: active, settings: {} } as unknown as Project);
    const same = compareWithCurrent(mk('x', 'DB'), mk('y', 'DB'));
    expect(same.isEmpty).toBe(true);
    const diff = compareWithCurrent(mk('x', 'DB', 'nope'), mk('y', 'Cache'));
    expect(diff.isEmpty).toBe(false);
  });
});

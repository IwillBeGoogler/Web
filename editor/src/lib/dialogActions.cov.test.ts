import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dialogs } from './dialogs';
import { BIG_SELECTION, confirmApply, deletePageDialog, deleteProjectDialog, duplicateProjectDialog, exportDialog, importConflictDialog, leaveDialog, MAX_NAME, nameError, newProjectDialog, pageNameError, planDelete, renameGroupDialog, renamePageDialog, renameProjectDialog, requestDelete } from './dialogActions';
import { useDiagramStore } from '../store/diagramStore';
import { useToastStore } from '../store/toastStore';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const n = (id: string, x = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y: 0 }, width: 10, height: 10, data: { label: id }, ...extra }) as DiagramNode;
const flush = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  vi.restoreAllMocks();
  s().reset();
  useToastStore.getState().clear();
});

describe('name validation', () => {
  it('nameError: empty, too long, ok', () => {
    expect(nameError('  ')).toBe('Name is required');
    expect(nameError('x'.repeat(MAX_NAME + 1))).toContain('at most');
    expect(nameError('ok')).toBeNull();
  });
  it('pageNameError: duplicates compare trimmed and case-insensitively, self excluded, base error first', () => {
    const pages = [{ id: 'a', name: 'Home' }, { id: 'b', name: 'Other' }];
    expect(pageNameError(pages, '')).toBe('Name is required');
    expect(pageNameError(pages, ' home ')).toContain('already exists');
    expect(pageNameError(pages, 'Home', 'a')).toBeNull();
    expect(pageNameError(pages, 'New')).toBeNull();
  });
});

describe('page dialogs', () => {
  it('renamePageDialog: unknown page, cancel, rename, validate callback', async () => {
    expect(await renamePageDialog('ghost')).toBeNull();
    const spy = vi.spyOn(dialogs, 'prompt').mockResolvedValueOnce(null);
    expect(await renamePageDialog()).toBeNull();
    const validate = (spy.mock.calls[0][0] as { validate: (v: string) => string | null }).validate;
    expect(validate('')).toBe('Name is required');
    spy.mockResolvedValueOnce('Renamed');
    expect(await renamePageDialog(s().activePageId)).toBe('Renamed');
    expect(s().pages[0].name).toBe('Renamed');
  });
  it('deletePageDialog: unknown, last page toasts, declined, confirmed', async () => {
    expect(await deletePageDialog('ghost')).toBe(false);
    expect(await deletePageDialog()).toBe(false);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    const second = s().addPage('Two');
    const conf = vi.spyOn(dialogs, 'confirm').mockResolvedValueOnce(false);
    expect(await deletePageDialog(second)).toBe(false);
    conf.mockResolvedValueOnce(true);
    expect(await deletePageDialog(second)).toBe(true);
  });
});

describe('project dialogs', () => {
  it('delete confirms with type-to-confirm only for big projects', async () => {
    const conf = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    await deleteProjectDialog('P', 1);
    expect((conf.mock.calls[0][0] as { typeToConfirm?: string }).typeToConfirm).toBeUndefined();
    await deleteProjectDialog('P', 9);
    expect((conf.mock.calls[1][0] as { typeToConfirm?: string }).typeToConfirm).toBe('P');
  });
  it('rename, duplicate, new project, export, import conflict, leave, confirmApply delegate to dialogs', async () => {
    const prompt = vi.spyOn(dialogs, 'prompt').mockResolvedValue('x');
    expect(await renameProjectDialog('a')).toBe('x');
    expect(await duplicateProjectDialog('a')).toBe('x');
    expect((prompt.mock.calls[1][0] as { initial: string }).initial).toBe('a (copy)');
    const custom = vi.spyOn(dialogs, 'custom').mockResolvedValue(null);
    await newProjectDialog([{ id: 't', name: 'T' }]);
    await exportDialog({} as never, 2);
    for (const c of custom.mock.calls) (c[0] as { render: (api: unknown) => unknown }).render({ done: () => {}, cancel: () => {} });
    const choose = vi.spyOn(dialogs, 'choose').mockResolvedValue('copy');
    expect(await importConflictDialog('f')).toBe('copy');
    expect(await leaveDialog()).toBe('copy');
    const conf = vi.spyOn(dialogs, 'confirm').mockResolvedValue(true);
    expect(await confirmApply('t', 'm')).toBe(true);
    expect((conf.mock.calls[0][0] as { confirmLabel: string }).confirmLabel).toBe('Apply');
    expect(choose).toHaveBeenCalledTimes(2);
  });
});

describe('renameGroupDialog', () => {
  it('unknown node, group and cluster wording, cancel keeps the label', async () => {
    expect(await renameGroupDialog('ghost')).toBeNull();
    s().addNode(n('g', 0, { type: 'group' }));
    s().addNode(n('c', 0, { type: 'cluster' }));
    const prompt = vi.spyOn(dialogs, 'prompt').mockResolvedValueOnce('G2').mockResolvedValueOnce(null);
    expect(await renameGroupDialog('g')).toBe('G2');
    expect(await renameGroupDialog('c')).toBeNull();
    expect((prompt.mock.calls[0][0] as { title: string }).title).toBe('Rename group');
    expect((prompt.mock.calls[1][0] as { title: string }).title).toBe('Rename cluster');
    expect(s().nodes.find((x) => x.id === 'g')!.data.label).toBe('G2');
    expect(s().nodes.find((x) => x.id === 'c')!.data.label).toBe('c');
  });
});

describe('planDelete / requestDelete', () => {
  const grouped = () => {
    s().addNode(n('g', 0, { type: 'group' }));
    s().addNode(n('k1', 0, { parentId: 'g' }));
    s().addNode(n('k2', 0, { parentId: 'g' }));
    s().addNode(n('lone', 50));
  };
  it('planDelete finds groups with children outside the selection', () => {
    grouped();
    expect(planDelete(s().nodes, ['g'], []).groups.map((x) => x.id)).toEqual(['g']);
    expect(planDelete(s().nodes, ['g', 'k1', 'k2'], ['e']).groups).toEqual([]);
    expect(planDelete(s().nodes, ['g', 'k1', 'k2'], ['e']).count).toBe(4);
  });
  it('small plain selections delete immediately, selection comes from the store when no target', () => {
    s().addNode(n('a'));
    s().selectOnly('node', 'a');
    const run = vi.fn(() => 1);
    const kept = vi.fn();
    requestDelete(undefined, run, kept);
    expect(run).toHaveBeenCalledWith(undefined);
    expect(kept).toHaveBeenCalledWith(1);
    requestDelete({ edges: ['x'] }, run, kept);
    requestDelete({ nodes: ['a'] }, run, kept);
    expect(run).toHaveBeenCalledTimes(3);
  });
  it('group: cancel does nothing; delete group only ungroups then deletes the rest; delete with children', async () => {
    grouped();
    const run = vi.fn(() => 2);
    const kept = vi.fn();
    const choose = vi.spyOn(dialogs, 'choose').mockResolvedValueOnce(null);
    requestDelete({ nodes: ['g'] }, run, kept);
    await flush();
    expect(run).not.toHaveBeenCalled();
    choose.mockResolvedValueOnce('only');
    requestDelete({ nodes: ['g', 'lone'] }, run, kept);
    await flush();
    expect(run).toHaveBeenCalledWith({ nodes: ['lone'], edges: [] });
    expect(kept).toHaveBeenCalledWith(2);
    s().reset();
    grouped();
    choose.mockResolvedValueOnce('only');
    const run2 = vi.fn(() => 0);
    requestDelete({ nodes: ['g'] }, run2, kept);
    await flush();
    expect(run2).not.toHaveBeenCalled();
    s().reset();
    grouped();
    s().addNode(n('cl', 0, { type: 'cluster' }));
    s().addNode(n('cl-k', 0, { parentId: 'cl' }));
    choose.mockResolvedValueOnce('all');
    const run3 = vi.fn(() => 5);
    requestDelete({ nodes: ['g', 'cl'] }, run3, kept);
    await flush();
    expect(run3).toHaveBeenCalledWith({ nodes: ['g', 'cl'], edges: [] });
    expect((choose.mock.calls.at(-1)![0] as { title: string }).title).toContain('2 groups');
  });
  it('group delete-only followed by a big remainder asks for confirmation', async () => {
    s().addNode(n('g', 0, { type: 'group' }));
    s().addNode(n('k', 0, { parentId: 'g' }));
    const ids = Array.from({ length: BIG_SELECTION + 1 }, (_, i) => `x${i}`);
    for (const id of ids) s().addNode(n(id));
    vi.spyOn(dialogs, 'choose').mockResolvedValue('only');
    const conf = vi.spyOn(dialogs, 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const run = vi.fn(() => 1);
    requestDelete({ nodes: ['g', ...ids] }, run, vi.fn());
    await flush();
    expect(run).not.toHaveBeenCalled();
    requestDelete({ nodes: ['g', ...ids] }, run, vi.fn());
    await flush();
    expect(conf).toHaveBeenCalledTimes(2);
  });
  it('big plain selections need confirmation', async () => {
    const ids = Array.from({ length: BIG_SELECTION + 1 }, (_, i) => `y${i}`);
    for (const id of ids) s().addNode(n(id));
    const conf = vi.spyOn(dialogs, 'confirm').mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const run = vi.fn(() => 3);
    const kept = vi.fn();
    requestDelete({ nodes: ids }, run, kept);
    await flush();
    expect(run).not.toHaveBeenCalled();
    requestDelete({ nodes: ids }, run, kept);
    await flush();
    expect(kept).toHaveBeenCalledWith(3);
    expect(conf).toHaveBeenCalledTimes(2);
  });
});

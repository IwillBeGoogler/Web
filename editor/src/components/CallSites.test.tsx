// Each destructive / naming call site opens the right modal (never window.confirm / prompt / alert).
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/exportImage', () => ({ exportPage: vi.fn(async () => undefined) }));
vi.mock('../lib/sdd/fileAccess', async (orig) => {
  const real = await orig<typeof import('../lib/sdd/fileAccess')>();
  return { ...real, saveSddFile: vi.fn(async () => ({ method: 'download', name: 'w.sdd', handle: null })), pickSddFile: vi.fn() };
});

import App from '../App';
import { exportPage } from '../lib/exportImage';
import { executeAction } from '../lib/actions';
import { buildSdd } from '../lib/sdd/sdd';
import { createProject } from '../lib/project';
import { useDiagramStore } from '../store/diagramStore';
import { useFileStore } from '../store/fileStore';
import { useUiStore } from '../store/uiStore';
import { useSettingsStore } from '../store/settingsStore';
import { listProjects } from '../lib/projects';
import { createWsProject, loadFile } from '../workspace/storage';
import { useWorkspace } from '../workspace/store';
import type { DiagramNode } from '../types';

const s = () => useDiagramStore.getState();
const icon = (id: string, x = 0, y = 0, extra: Partial<DiagramNode> = {}): DiagramNode => ({ id, type: 'icon', position: { x, y }, width: 100, height: 60, data: { label: id, iconId: 'service' }, ...extra });
const group = (id: string): DiagramNode => ({ id, type: 'group', position: { x: 0, y: 0 }, width: 400, height: 300, data: { label: id } });
const seedProject = () => {
  const p = createWsProject(localStorage, 'Seed').project;
  return render(<App initialProjectId={p.id} />);
};
const noNative = () => {
  const spies = [vi.spyOn(window, 'confirm'), vi.spyOn(window, 'prompt'), vi.spyOn(window, 'alert')];
  return () => spies.forEach((sp) => expect(sp).not.toHaveBeenCalled());
};

beforeEach(() => {
  localStorage.clear();
  s().reset();
  useFileStore.getState().reset();
  useUiStore.getState().resetUi();
  useSettingsStore.setState({ global: {} });
  vi.mocked(exportPage).mockClear();
});

describe('delete: groups and big selections', () => {
  it('Delete on a group with children asks: Delete group only / Delete with children / Cancel', async () => {
    const verify = noNative();
    seedProject();
    act(() => {
      s().loadDiagram({ nodes: [group('g'), icon('a', 20, 40, { parentId: 'g' }), icon('b', 200, 40, { parentId: 'g' })], edges: [] });
      s().selectOnly('node', 'g');
    });
    act(() => executeAction('delete', {}));
    let dialog = await screen.findByRole('dialog', { name: /Delete group/ });
    expect(s().nodes).toHaveLength(3); // nothing happened yet
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Delete group/ })).toBeNull());
    expect(s().nodes).toHaveLength(3);

    act(() => executeAction('delete', {}));
    dialog = await screen.findByRole('dialog', { name: /Delete group/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete group only' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(s().nodes.map((n) => n.id).sort()).toEqual(['a', 'b']));
    expect(s().nodes.every((n) => !n.parentId)).toBe(true);
    verify();
  });
  it('Delete with children removes the group and everything inside', async () => {
    seedProject();
    act(() => {
      s().loadDiagram({ nodes: [group('g'), icon('a', 20, 40, { parentId: 'g' }), icon('keep', 600, 0)], edges: [] });
      s().selectOnly('node', 'g');
    });
    act(() => executeAction('delete', {}));
    const dialog = await screen.findByRole('dialog', { name: /Delete group/ });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete with children' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(s().nodes.map((n) => n.id)).toEqual(['keep']));
  });
  it('an empty group, or a group deleted together with its children, deletes without asking', () => {
    seedProject();
    act(() => {
      s().loadDiagram({ nodes: [group('g'), group('empty')], edges: [] });
      s().selectOnly('node', 'empty');
    });
    act(() => executeAction('delete', {}));
    expect(s().nodes.map((n) => n.id)).toEqual(['g']);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('a selection of more than 10 items asks to confirm; exactly 10 does not', async () => {
    seedProject();
    const many = (n: number) => Array.from({ length: n }, (_, i) => icon(`n${i}`, i * 120, 0, { selected: true }));
    act(() => s().loadDiagram({ nodes: many(10), edges: [] }));
    act(() => executeAction('delete', {}));
    expect(s().nodes).toHaveLength(0); // 10: direct
    act(() => s().loadDiagram({ nodes: many(11), edges: [] }));
    act(() => executeAction('delete', {}));
    const dialog = await screen.findByRole('alertdialog', { name: 'Delete 11 items?' });
    expect(s().nodes).toHaveLength(11);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(s().nodes).toHaveLength(11);
    act(() => executeAction('delete', {}));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete 11 items' }));
    await waitFor(() => expect(s().nodes).toHaveLength(0));
  });
});

describe('rename', () => {
  it('group / cluster rename opens a dialog with validation; canvas node labels keep the inline editor', async () => {
    seedProject();
    act(() => s().loadDiagram({ nodes: [group('g'), icon('a')], edges: [] }));
    act(() => executeAction('rename', { nodeId: 'g' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename group' });
    const input = within(dialog).getByLabelText('Group name');
    fireEvent.change(input, { target: { value: '' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Name is required');
    fireEvent.change(input, { target: { value: 'Backend' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(s().nodes.find((n) => n.id === 'g')!.data.label).toBe('Backend'));
    // an icon node: inline editing, no modal
    act(() => executeAction('rename', { nodeId: 'a' }));
    expect(useUiStore.getState().editingId).toBe('a');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Rename/ })).toBeNull());
  });
  it('project rename from the editor menu opens a dialog', async () => {
    seedProject();
    fireEvent.click(screen.getByRole('button', { name: 'Project menu' }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Rename project' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename project' });
    fireEvent.change(within(dialog).getByLabelText('Project name'), { target: { value: 'Renamed' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(useWorkspace.getState().project?.name).toBe('Renamed'));
    expect(s().projectName).toBe('Seed'); // the file keeps its own name
  });
  it('the file name in the top bar renames the file everywhere (explorer entry, tab, document)', async () => {
    seedProject();
    const input = screen.getByLabelText('File name') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Billing' } });
    fireEvent.blur(input);
    await waitFor(() => expect(s().projectName).toBe('Billing'));
    expect(useWorkspace.getState().tree.files[0].name).toBe('Billing');
    expect(loadFile(localStorage, s().projectId)?.name).toBe('Billing');
  });
});

describe('New project from the editor, Export dialog', () => {
  it('File > New project opens the New project modal', async () => {
    seedProject();
    fireEvent.click(screen.getByRole('button', { name: /^File/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /New project/ }));
    const dialog = await screen.findByRole('dialog', { name: 'New project' });
    fireEvent.change(within(dialog).getByLabelText('Project name'), { target: { value: 'Second' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create project' }));
    await waitFor(() => expect(listProjects(localStorage).map((p) => p.name).sort()).toEqual(['Second', 'Seed']));
  });
  it('Export > Export image… offers format / scale / transparent / pages and exports with them', async () => {
    seedProject();
    act(() => s().addPage('Two', { nodes: [icon('x')], edges: [] }));
    fireEvent.click(screen.getByRole('button', { name: /^File/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Export image…' }));
    const dialog = await screen.findByRole('dialog', { name: 'Export' });
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Format' })).getByRole('button', { name: 'SVG' }));
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Scale' })).getByRole('button', { name: '3x' }));
    fireEvent.click(within(within(dialog).getByRole('group', { name: 'Background' })).getByRole('button', { name: 'White' }));
    expect(within(dialog).getByLabelText('Pages')).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Export' }));
    await waitFor(() => expect(exportPage).toHaveBeenCalledTimes(1));
    const [kind, , opts] = vi.mocked(exportPage).mock.calls[0];
    expect(kind).toBe('svg');
    expect(opts).toMatchObject({ scale: 3, transparent: false });
  });
});

describe('import conflict, unsaved changes on leave', () => {
  it('Replace overwrites the existing project', async () => {
    createWsProject(localStorage, 'Existing', { fileId: 'prj_xfile' });
    render(<App />);
    const incoming = createProject('Incoming');
    incoming.id = 'prj_xfile';
    incoming.pages[0].nodes = [icon('n1')];
    const file = new File([buildSdd(incoming) as unknown as BlobPart], 'p.sdd');
    fireEvent.drop(window, { dataTransfer: { types: ['Files'], files: [file], dropEffect: 'none' } });
    const dialog = await screen.findByRole('dialog', { name: 'File already exists' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Replace' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(loadFile(localStorage, 'prj_xfile')?.name).toBe('Incoming'));
    expect(listProjects(localStorage)).toHaveLength(1);
  });
  it('leaving with unsaved .sdd changes asks: Stay / Leave without saving', async () => {
    seedProject();
    act(() => useFileStore.setState({ fileName: 'seed.sdd', dirty: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    let dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Stay' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Unsaved changes' })).toBeNull());
    expect(window.location.pathname).toMatch(/^\/p\//);
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    dialog = await screen.findByRole('dialog', { name: 'Unsaved changes' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Leave without saving' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(window.location.pathname).toBe('/projects'));
  });
  it('a clean project (or one never saved to a file) leaves without asking', () => {
    seedProject();
    fireEvent.click(screen.getByRole('button', { name: 'Back to projects' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(window.location.pathname).toBe('/projects');
  });
});

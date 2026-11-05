import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../lib/sdd/fileAccess', async (orig) => {
  const real = await orig<typeof import('../lib/sdd/fileAccess')>();
  return { ...real, saveSddFile: vi.fn(), pickSddFile: vi.fn() };
});

import App from '../App';
import { saveSddFile, pickSddFile } from '../lib/sdd/fileAccess';
import { buildSdd, readSdd } from '../lib/sdd/sdd';
import { createProject } from '../lib/project';
import { listProjects } from '../lib/projects';
import { createWsProject, listWsProjects, loadFile } from '../workspace/storage';
import { seedProject } from '../test/workspace';
import { useDiagramStore } from '../store/diagramStore';
import { useFileStore } from '../store/fileStore';
import { useToastStore } from '../store/toastStore';
import type { DiagramNode } from '../types';

const node = (id: string): DiagramNode => ({ id, type: 'icon', position: { x: 0, y: 0 }, data: { label: id, iconId: 'redis' } });
const sddFile = (name = 'p.sdd', id = 'prj_xfile', projName = 'Dropped') => {
  const p = createProject(projName);
  p.id = id;
  p.pages[0].nodes = [node('n1')];
  return { p, file: new File([buildSdd(p) as unknown as BlobPart], name) };
};
const dt = (files: File[]) => ({ types: ['Files'], files, dropEffect: 'none' });

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useFileStore.getState().reset();
  useToastStore.getState().clear();
  vi.mocked(saveSddFile).mockReset();
  vi.mocked(pickSddFile).mockReset();
});

describe('drag and drop', () => {
  it('shows a full-screen overlay while dragging a file, hides on leave', async () => {
    render(<App />);
    fireEvent.dragEnter(window, { dataTransfer: dt([]) });
    expect(await screen.findByTestId('drop-overlay')).toBeInTheDocument();
    fireEvent.dragLeave(window, { dataTransfer: dt([]) });
    await waitFor(() => expect(screen.queryByTestId('drop-overlay')).toBeNull());
  });
  it('dropping a .sdd on the home screen opens the project', async () => {
    render(<App />);
    const { file } = sddFile();
    fireEvent.drop(window, { dataTransfer: dt([file]) });
    await waitFor(() => expect(useDiagramStore.getState().projectName).toBe('Dropped'));
    expect(loadFile(localStorage, 'prj_xfile')).not.toBeNull(); // the file keeps its id, inside a new project
    expect(listWsProjects(localStorage).map((p) => p.name)).toEqual(['Dropped']);
    expect(screen.getByTestId('topbar')).toBeInTheDocument(); // editor visible
  });
  it('dropping something else gives a clear error', async () => {
    render(<App />);
    fireEvent.drop(window, { dataTransfer: dt([new File(['x'], 'pic.png')]) });
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => /\.sdd/.test(t.message))).toBe(true));
  });
  it('a corrupt .sdd shows an error naming the file and does not crash', async () => {
    render(<App />);
    fireEvent.drop(window, { dataTransfer: dt([new File([new Uint8Array(64)], 'broken.sdd')]) });
    await waitFor(() => expect(useToastStore.getState().toasts.some((t) => /broken\.sdd/.test(t.message))).toBe(true));
    expect(listProjects(localStorage)).toHaveLength(0);
    expect(listWsProjects(localStorage)).toHaveLength(0);
  });
});

describe('open conflict prompt', () => {
  it('same file id: modal Replace / Open as copy', async () => {
    createWsProject(localStorage, 'Existing', { fileId: 'prj_xfile' });
    render(<App />);
    const { file } = sddFile();
    fireEvent.drop(window, { dataTransfer: dt([file]) });
    const bar = await screen.findByRole('dialog', { name: /already exists/i });
    expect(bar).toHaveAttribute('aria-modal', 'true');
    fireEvent.click(within(bar).getByRole('button', { name: 'Open as copy' }));
    fireEvent.click(within(bar).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(listProjects(localStorage).map((m) => m.name).sort()).toEqual(['Dropped (copy)', 'Existing']));
    expect(listProjects(localStorage).map((m) => m.name).sort()).toEqual(['Dropped (copy)', 'Existing']);
  });
});

describe('File menu, save and dirty indicator', () => {
  const openEditor = () => {
    const p = seedProject('Work');
    render(<App initialProjectId={p.projectId} />);
    return p;
  };
  it('has New project, Open .sdd, Save, Save as, Import JSON', () => {
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: /^File/ }));
    for (const name of [/New project/, /Open \.sdd/, /^Save ⌘S/, /Save as/, /Import JSON/]) expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
  });
  it('Cmd+S saves a valid .sdd; the dot appears after an edit and clears after save', async () => {
    vi.mocked(saveSddFile).mockResolvedValue({ method: 'download', name: 'work.sdd', handle: null });
    openEditor();
    expect(screen.queryByRole('status', { name: 'Unsaved changes' })).toBeNull();
    // saving once sets the baseline file; then edit
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    await waitFor(() => expect(saveSddFile).toHaveBeenCalledTimes(1));
    act(() => useDiagramStore.getState().addNode(node('a')));
    expect(await screen.findByRole('status', { name: 'Unsaved changes' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 's', metaKey: true });
    await waitFor(() => expect(saveSddFile).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole('status', { name: 'Unsaved changes' })).toBeNull());
    const bytes = vi.mocked(saveSddFile).mock.calls[1][0];
    expect(readSdd(bytes).project.pages[0].nodes.map((n) => n.id)).toEqual(['a']);
  });
  it('Open .sdd… uses the picker', async () => {
    const { p, file } = sddFile('o.sdd', 'prj_open', 'Picked');
    vi.mocked(pickSddFile).mockResolvedValue({ bytes: new Uint8Array(await file.arrayBuffer()), name: 'o.sdd', handle: null });
    openEditor();
    fireEvent.click(screen.getByRole('button', { name: /^File/ }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Open \.sdd/ }));
    await waitFor(() => expect(useDiagramStore.getState().projectId).toBe(p.id));
    expect(useFileStore.getState().fileName).toBe('o.sdd');
  });
  it('home screen: Open .sdd button and drop zone', async () => {
    const { file } = sddFile('h.sdd', 'prj_home', 'FromHome');
    vi.mocked(pickSddFile).mockResolvedValue({ bytes: new Uint8Array(await file.arrayBuffer()), name: 'h.sdd', handle: null });
    render(<App />);
    expect(screen.getByLabelText(/Drop a .sdd file here/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Open \.sdd/ }));
    await waitFor(() => expect(useDiagramStore.getState().projectName).toBe('FromHome'));
  });
});

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDialogStore } from '../../lib/dialogs';
import { DialogHost } from '../ui/DialogHost';
import { createWsFile, createWsProject, loadFile, loadTree, setProjectSync } from '../../workspace/storage';
import { useWorkspace } from '../../workspace/store';
import { clearTabSessions } from '../../workspace/tabSession';
import { FilesPopover } from '../FilesPopover';
import { QuickSwitcher } from '../QuickSwitcher';
import { FileExplorer } from './FileExplorer';

const ws = () => useWorkspace.getState();
let pid: string;
let alpha: string;
let beta: string;
let gamma: string;

function seed() {
  const r = createWsProject(localStorage, 'Platform', { fileName: 'Alpha' });
  pid = r.project.id;
  alpha = r.fileId;
  beta = createWsFile(localStorage, pid, { name: 'Beta' }).file.id;
  gamma = createWsFile(localStorage, pid, { name: 'Gamma' }).file.id;
}
const mount = () => {
  ws().load(localStorage, pid, 'local');
  return render(<><FileExplorer /><DialogHost /></>);
};
const row = (name: string) => screen.getByTestId(`ex-file-${name}`);
const names = () => Array.from(document.querySelectorAll('[role="treeitem"] .ex-name')).map((e) => e.textContent);

beforeEach(() => {
  localStorage.clear();
  clearTabSessions();
  act(() => useDialogStore.getState().clear());
  window.history.replaceState({}, '', '/');
  ws().unload();
  seed();
});

describe('flat file list (Project › Files)', () => {
  it('lists the files of the project, flat: no folders, no tree levels', () => {
    mount();
    expect(screen.getByText('Platform')).toBeInTheDocument();
    expect(screen.getByRole('tree', { name: 'Project files' })).toBeInTheDocument();
    expect(names().sort()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(screen.queryByRole('button', { name: /folder/i })).toBeNull();
    for (const r of document.querySelectorAll('[role="treeitem"]')) expect(r.getAttribute('aria-level')).toBe('1');
  });

  it('files carry an icon by their dominant content kind', () => {
    const t = loadTree(localStorage, pid);
    localStorage.setItem(`sdd:ws:tree:${pid}`, JSON.stringify({ ...t, files: t.files.map((f) => (f.id === beta ? { ...f, kind: 'board' } : f.id === alpha ? { ...f, kind: 'erd' } : f)) }));
    mount();
    expect(row('Beta').querySelector('[data-kind="board"]')).toBeTruthy();
    expect(row('Alpha').querySelector('[data-kind="erd"]')).toBeTruthy();
  });

  it('clicking a file opens it in a tab and goes to its URL; an open file just activates', () => {
    mount();
    fireEvent.click(row('Alpha'));
    expect(ws().tabs).toMatchObject({ open: [alpha], active: alpha });
    expect(window.location.pathname).toBe(`/p/${pid}/f/${alpha}`);
    fireEvent.click(row('Beta'));
    fireEvent.click(row('Alpha'));
    expect(ws().tabs.active).toBe(alpha);
    expect(ws().tabs.open).toEqual([alpha, beta]);
  });

  it('sort: Recent (most recently opened first) and Name (A-Z); the choice is remembered', () => {
    mount();
    fireEvent.click(row('Gamma'));
    fireEvent.click(row('Beta'));
    expect(names()[0]).toBe('Beta');
    expect(names()[1]).toBe('Gamma');
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(localStorage.getItem('sdd:files-sort')).toBe('name');
    expect(screen.getByRole('button', { name: /Name/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('search filters by name and clears', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    fireEvent.change(screen.getByLabelText('Filter files'), { target: { value: 'et' } });
    expect(names()).toEqual(['Beta']);
    fireEvent.change(screen.getByLabelText('Filter files'), { target: { value: 'zzz' } });
    expect(screen.getByText(/No files match/)).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('Clear filter'));
    expect(names()).toHaveLength(3);
  });

  it('create: the New file button asks for a name and opens the new file', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'New file' }));
    const dialog = await screen.findByRole('dialog', { name: 'New file' });
    fireEvent.change(within(dialog).getByLabelText('File name'), { target: { value: 'Billing' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(names()).toContain('Billing'));
    expect(loadTree(localStorage, pid).files.find((f) => f.name === 'Billing')?.folderId).toBeNull();
    expect(ws().tabs.active).toBe(loadTree(localStorage, pid).files.find((f) => f.name === 'Billing')!.id);
  });

  it('rename (button or F2) validates unique names; the document follows', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Beta' }));
    let dialog = await screen.findByRole('dialog', { name: 'Rename file' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'gamma' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Beta 2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(names()).toContain('Beta 2'));
    expect(loadFile(localStorage, beta)?.name).toBe('Beta 2');
    fireEvent.keyDown(row('Beta 2'), { key: 'F2' });
    dialog = await screen.findByRole('dialog', { name: 'Rename file' });
    expect((within(dialog).getByLabelText('Name') as HTMLInputElement).value).toBe('Beta 2');
  });

  it('duplicate makes a copy next to it with its own document', () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Gamma' }));
    const files = loadTree(localStorage, pid).files;
    expect(files).toHaveLength(4);
    const copy = files.find((f) => f.id !== gamma && f.name.startsWith('Gamma'))!;
    expect(copy.name).not.toBe('Gamma');
    expect(loadFile(localStorage, copy.id)).not.toBeNull();
  });

  it('delete asks first, then removes the file and its document', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Delete Gamma' }));
    const dialog = await screen.findByRole('alertdialog', { name: /Delete file/ });
    expect(loadTree(localStorage, pid).files).toHaveLength(3);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(names()).not.toContain('Gamma'));
    expect(loadFile(localStorage, gamma)).toBeNull();
  });

  it('context menu: open, rename, duplicate, delete (no folder items)', () => {
    mount();
    fireEvent.contextMenu(row('Beta'));
    const items = within(screen.getByTestId('context-menu')).getAllByRole('menuitem').map((m) => m.querySelector('.ctx-label')?.textContent);
    expect(items).toEqual(['Open', 'Open in background tab', 'Add to starred', 'Rename…', 'Duplicate', 'Delete…']);
  });

  it('keyboard: arrows move focus, Enter opens, Delete asks', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: /Name/ }));
    fireEvent.focus(row('Alpha'));
    fireEvent.keyDown(row('Alpha'), { key: 'ArrowDown' });
    await waitFor(() => expect(ws().focusId).toBe(beta));
    fireEvent.keyDown(row('Beta'), { key: 'Enter' });
    expect(ws().tabs.active).toBe(beta);
    fireEvent.keyDown(row('Beta'), { key: 'Delete' });
    expect(await screen.findByRole('alertdialog', { name: /Delete file/ })).toBeInTheDocument();
  });

  it('shows a dot on files other people have open', () => {
    mount();
    act(() => ws().setPresence({ [alpha]: ['Grace Hopper'] }));
    expect(within(row('Alpha')).getByTestId('file-presence')).toHaveAttribute('title', 'Open now: Grace Hopper');
    expect(within(row('Beta')).queryByTestId('file-presence')).toBeNull();
  });

  it('viewers can browse and open but not create, rename, duplicate or delete', () => {
    setProjectSync(localStorage, pid, { serverBacked: true, role: 'viewer', treeRev: 1, lastSyncedAt: 1 });
    mount();
    expect(screen.queryByRole('button', { name: 'New file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Rename Alpha' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Delete Alpha' })).toBeNull();
    fireEvent.keyDown(row('Alpha'), { key: 'F2' });
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(row('Alpha'));
    expect(ws().tabs.active).toBe(alpha);
  });

  it('an empty project explains itself', () => {
    const r = createWsProject(localStorage, 'Empty');
    for (const f of loadTree(localStorage, r.project.id).files) localStorage.removeItem(`sdd:project:${f.id}`);
    localStorage.setItem(`sdd:ws:tree:${r.project.id}`, JSON.stringify({ folders: [], files: [] }));
    ws().load(localStorage, r.project.id, 'local');
    render(<FileExplorer />);
    expect(screen.getByText(/No files yet/)).toBeInTheDocument();
  });
});

describe('Files popover (top bar)', () => {
  const mountPop = () => {
    ws().load(localStorage, pid, 'local');
    return render(<><FilesPopover /><QuickSwitcher /><DialogHost /></>);
  };
  it('the button opens the compact file list; Esc and outside click close it; opening a file closes it', () => {
    mountPop();
    expect(screen.queryByTestId('files-popover')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Switch file' }));
    expect(within(screen.getByTestId('files-popover')).getByRole('tree', { name: 'Project files' })).toBeInTheDocument();
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('files-popover')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Switch file' }));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('files-popover')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Switch file' }));
    fireEvent.click(row('Beta'));
    expect(ws().tabs.active).toBe(beta);
    expect(screen.queryByTestId('files-popover')).toBeNull();
  });

  it('⌘P opens "Go to file": type, Enter opens the file', async () => {
    mountPop();
    fireEvent.keyDown(window, { key: 'p', metaKey: true });
    const input = await screen.findByRole('combobox', { name: 'Go to file' });
    fireEvent.change(input, { target: { value: 'gam' } });
    expect(screen.getAllByRole('option')).toHaveLength(1);
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(ws().tabs.active).toBe(gamma);
    expect(screen.queryByRole('dialog', { name: 'Go to file' })).toBeNull();
  });

  it('⌘P with no results says so; Esc closes', async () => {
    mountPop();
    fireEvent.keyDown(window, { key: 'p', ctrlKey: true });
    const input = await screen.findByRole('combobox', { name: 'Go to file' });
    fireEvent.change(input, { target: { value: 'nothing' } });
    expect(screen.getByText('No matching files')).toBeInTheDocument();
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Go to file' })).toBeNull();
  });
});

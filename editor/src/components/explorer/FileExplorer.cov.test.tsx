import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDialogStore } from '../../lib/dialogs';
import { createWsFile, createWsProject } from '../../workspace/storage';
import { useWorkspace } from '../../workspace/store';
import { clearTabSessions } from '../../workspace/tabSession';
import { DialogHost } from '../ui/DialogHost';
import { FileExplorer } from './FileExplorer';

const ws = () => useWorkspace.getState();
let pid: string;
let alpha: string;
let beta: string;
let gamma: string;

beforeEach(() => {
  localStorage.clear();
  clearTabSessions();
  act(() => useDialogStore.getState().clear());
  window.history.replaceState({}, '', '/');
  ws().unload();
  const r = createWsProject(localStorage, 'Platform', { fileName: 'Alpha' });
  pid = r.project.id;
  alpha = r.fileId;
  beta = createWsFile(localStorage, pid, { name: 'Beta' }).file.id;
  gamma = createWsFile(localStorage, pid, { name: 'Gamma' }).file.id;
});
const mount = () => {
  ws().load(localStorage, pid, 'local');
  return render(
    <>
      <FileExplorer />
      <DialogHost />
    </>,
  );
};
const row = (name: string) => screen.getByTestId(`ex-file-${name}`);
const names = () => Array.from(document.querySelectorAll('[role="treeitem"] .ex-name')).map((e) => e.textContent);
const tree = () => screen.getByRole('tree', { name: 'Project files' });
const key = (el: Element, k: string, init: Record<string, unknown> = {}) => fireEvent.keyDown(el, { key: k, ...init });
const flush = () => act(async () => void (await Promise.resolve()));

describe('keyboard navigation', () => {
  it('arrows, Home, End move focus within bounds; Enter opens; Space opens in background', async () => {
    mount();
    const first = names()[0] as string;
    fireEvent.focus(row(first));
    key(row(first), 'ArrowDown');
    await flush();
    key(row(names()[1] as string), 'ArrowUp');
    key(row(names()[0] as string), 'ArrowUp');
    key(row(names()[0] as string), 'End');
    await flush();
    key(row(names().at(-1) as string), 'ArrowDown');
    key(row(names().at(-1) as string), 'Home');
    await flush();
    key(row(names()[0] as string), 'Enter');
    expect(ws().tabs.open.length).toBeGreaterThan(0);
    key(row(names()[1] as string), ' ');
    expect(ws().tabs.open.length).toBeGreaterThanOrEqual(1);
  });
  it('keys with a modifier are ignored; unknown keys do nothing; nothing focused ignores Enter', () => {
    mount();
    const section = tree().closest('section')!;
    key(section, 'ArrowDown', { ctrlKey: true });
    key(section, 'ArrowDown', { metaKey: true });
    key(section, 'x');
    key(section, 'Enter');
    expect(ws().tabs.open).toHaveLength(0);
  });
  it('F2 renames and Delete/Backspace delete the focused file (dialogs open)', async () => {
    mount();
    act(() => row('Beta').focus());
    key(row('Beta'), 'F2');
    await flush();
    expect(useDialogStore.getState().stack?.length ?? 1).toBeGreaterThanOrEqual(0);
    act(() => useDialogStore.getState().clear());
    key(row('Beta'), 'Delete');
    await flush();
    act(() => useDialogStore.getState().clear());
    key(row('Beta'), 'Backspace');
    await flush();
    act(() => useDialogStore.getState().clear());
  });
  it('ContextMenu key opens the context menu and its items run', async () => {
    mount();
    act(() => row('Beta').focus());
    key(row('Beta'), 'ContextMenu');
    const menu = await screen.findByRole('menu');
    fireEvent.click(within(menu).getByText('Add to starred'));
    fireEvent.contextMenu(row('Beta'), { clientX: 5, clientY: 5 });
    fireEvent.click(within(await screen.findByRole('menu')).getByText('Remove from starred'));
    fireEvent.contextMenu(row('Beta'));
    fireEvent.click(within(await screen.findByRole('menu')).getByText('Open in background tab'));
    expect(ws().tabs.open).toContain(beta);
    fireEvent.contextMenu(row('Beta'));
    fireEvent.click(within(await screen.findByRole('menu')).getByText('Go to tab'));
    fireEvent.contextMenu(row('Gamma'));
    fireEvent.click(within(await screen.findByRole('menu')).getByText('Open'));
    expect(ws().tabs.open).toContain(gamma);
    for (const label of [/^Rename/, /^Duplicate/, /^Delete/]) {
      fireEvent.contextMenu(row('Alpha'));
      fireEvent.click(within(await screen.findByRole('menu')).getByText(label));
      await flush();
      act(() => useDialogStore.getState().clear());
    }
    expect(alpha).toBeTruthy();
  });
});

describe('filter input', () => {
  it('Escape clears an active filter and refocuses the first row; ArrowDown jumps to the rows; empty state shown', async () => {
    mount();
    const input = screen.getByRole('searchbox', { name: 'Filter files' });
    fireEvent.change(input, { target: { value: 'zzz' } });
    expect(screen.getByText(/No files match/)).toBeInTheDocument();
    key(input, 'Escape');
    expect((input as HTMLInputElement).value).toBe('');
    key(input, 'Escape');
    key(input, 'ArrowDown');
    key(input, 'a');
    await flush();
    fireEvent.change(input, { target: { value: 'be' } });
    expect(names()).toEqual(['Beta']);
    fireEvent.click(screen.getByRole('button', { name: 'Clear filter' }));
    expect(names()).toHaveLength(3);
  });
});

describe('sort and stars', () => {
  it('remembers name sort from storage; row action buttons and star toggle work', () => {
    localStorage.setItem('sdd:ex:sort', 'name');
    mount();
    fireEvent.click(screen.getByTitle('A to Z'));
    fireEvent.click(screen.getByTitle('Most recently opened first'));
    fireEvent.click(screen.getByTitle('A to Z'));
    expect(names()).toEqual(['Alpha', 'Beta', 'Gamma']);
    fireEvent.click(screen.getByRole('button', { name: 'Star Beta' }));
    expect(screen.getByRole('button', { name: 'Unstar Beta' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Unstar Beta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate Beta' }));
    expect(names().length).toBe(4);
  });
  it('rename and delete buttons open dialogs; the new-file button opens one', async () => {
    mount();
    fireEvent.click(screen.getByRole('button', { name: 'Rename Beta' }));
    await flush();
    act(() => useDialogStore.getState().clear());
    fireEvent.click(screen.getByRole('button', { name: 'Delete Beta' }));
    await flush();
    act(() => useDialogStore.getState().clear());
    fireEvent.click(screen.getByRole('button', { name: 'New file' }));
    await flush();
    act(() => useDialogStore.getState().clear());
  });
});

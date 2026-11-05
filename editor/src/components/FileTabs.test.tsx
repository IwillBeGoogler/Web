import { act, createEvent, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { usePendingSave } from '../hooks/useProjectPersistence';
import { useWorkspaceShortcuts } from '../hooks/useWorkspaceShortcuts';
import { useFileStore } from '../store/fileStore';
import { freshMeta, setMeta } from '../sync/meta';
import { closeFileTab, createFileIn, openFile } from '../workspace/actions';
import { createWsProject, loadFile } from '../workspace/storage';
import { useWorkspace } from '../workspace/store';
import { clearTabSessions } from '../workspace/tabSession';
import { FileTabs } from './FileTabs';
import { DialogHost } from './ui/DialogHost';

const ws = () => useWorkspace.getState();
let pid: string;
let a: string;
let b: string;
let c: string;

function Host() {
  useWorkspaceShortcuts();
  return (
    <>
      <FileTabs />
      <DialogHost />
    </>
  );
}
const tab = (name: string) => screen.getByTestId(`ftab-${name}`);
const tabNames = () => Array.from(document.querySelectorAll('.ft-tab .ft-name')).map((e) => e.textContent);

beforeEach(() => {
  localStorage.clear();
  clearTabSessions();
  window.history.replaceState({}, '', '/');
  usePendingSave.getState().set(false);
  useFileStore.getState().reset();
  ws().unload();
  const r = createWsProject(localStorage, 'P', { fileName: 'Alpha' });
  pid = r.project.id;
  ws().load(localStorage, pid, 'local');
  a = r.fileId;
  openFile(a);
  b = createFileIn(null, 'Beta')!;
  c = createFileIn(null, 'Gamma')!;
});

describe('file tabs', () => {
  it('shows one tab per open file, the active one selected', () => {
    render(<Host />);
    expect(screen.getAllByRole('tab')).toHaveLength(3);
    expect(tabNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(tab('Gamma')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Alpha')).toHaveAttribute('aria-selected', 'false');
  });

  it('click switches; the URL follows', () => {
    render(<Host />);
    fireEvent.click(tab('Alpha'));
    expect(ws().tabs.active).toBe(a);
    expect(window.location.pathname).toBe(`/p/${pid}/f/${a}`);
  });

  it('middle-click closes a tab (and activates a neighbour when it was active)', () => {
    render(<Host />);
    fireEvent(tab('Beta'), new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    expect(tabNames()).toEqual(['Alpha', 'Gamma']);
    expect(ws().tabs.active).toBe(c);
    fireEvent(tab('Alpha'), new MouseEvent('auxclick', { button: 0, bubbles: true })); // other buttons do nothing
    expect(tabNames()).toEqual(['Alpha', 'Gamma']);
    fireEvent(tab('Gamma'), new MouseEvent('auxclick', { button: 1, bubbles: true, cancelable: true }));
    expect(ws().tabs.active).toBe(a);
    expect(ws().tabs.open).toEqual([a]);
  });

  it('the ✕ button closes a tab', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Close Beta' }));
    expect(tabNames()).toEqual(['Alpha', 'Gamma']);
  });

  it('the tab bar is not rendered with fewer than two open files (the breadcrumb shows the name)', () => {
    render(<Host />);
    expect(screen.getByTestId('file-tabs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Alpha' }));
    expect(screen.getByTestId('file-tabs')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Close Beta' }));
    expect(ws().tabs.open).toEqual([c]);
    expect(screen.queryByTestId('file-tabs')).toBeNull();
    expect(screen.queryByRole('tablist', { name: 'Open files' })).toBeNull();
  });

  it('⌘W closes the active tab, ⌘⇧T brings it back (Alt+W / Alt+Shift+T work in browsers that reserve the first)', () => {
    render(<Host />);
    fireEvent.keyDown(window, { key: 'w', metaKey: true });
    expect(tabNames()).toEqual(['Alpha', 'Beta']);
    fireEvent.keyDown(window, { key: 'T', metaKey: true, shiftKey: true });
    expect(tabNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(ws().tabs.active).toBe(c);
    fireEvent.keyDown(window, { key: 'w', code: 'KeyW', altKey: true });
    expect(tabNames()).toEqual(['Alpha', 'Beta']);
    fireEvent.keyDown(window, { key: 'T', code: 'KeyT', altKey: true, shiftKey: true });
    expect(tabNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
  });

  it('Ctrl+Tab cycles the tabs', () => {
    render(<Host />);
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true });
    expect(ws().tabs.active).toBe(a);
    fireEvent.keyDown(window, { key: 'Tab', ctrlKey: true, shiftKey: true });
    expect(ws().tabs.active).toBe(c);
  });

  it('shortcuts do nothing outside a project', () => {
    ws().unload();
    render(<Host />);
    const ev = new KeyboardEvent('keydown', { key: 'w', metaKey: true, bubbles: true, cancelable: true });
    window.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });

  it('drag to reorder: before / after indicators, then the new order is kept', () => {
    render(<Host />);
    const dt = { data: {} as Record<string, string>, effectAllowed: '', setData(k: string, v: string) { this.data[k] = v; } };
    const at = (type: 'dragOver' | 'drop', el: Element, x: number) => {
      const ev = createEvent[type](el, { dataTransfer: dt });
      Object.defineProperty(ev, 'clientX', { value: x });
      fireEvent(el, ev);
    };
    fireEvent.dragStart(tab('Gamma'), { dataTransfer: dt });
    at('dragOver', tab('Alpha'), -1); // jsdom rects are all zeros: x<0 is the left half: before
    expect(tab('Alpha')).toHaveClass('drop-before');
    at('drop', tab('Alpha'), -1);
    expect(tabNames()).toEqual(['Gamma', 'Alpha', 'Beta']);
    fireEvent.dragStart(tab('Gamma'), { dataTransfer: dt });
    at('dragOver', tab('Beta'), 1); // x>=0 is the right half: after
    expect(tab('Beta')).toHaveClass('drop-after');
    at('drop', tab('Beta'), 1);
    expect(tabNames()).toEqual(['Alpha', 'Beta', 'Gamma']);
    expect(ws().tabs.active).toBe(c);
    fireEvent.dragEnd(tab('Gamma'));
    expect(document.querySelector('[class*="drop-"]')).toBeNull();
  });

  it('shows a dot for unsaved changes (local edits not yet written, or an upload waiting) instead of the ✕', () => {
    render(<Host />);
    expect(screen.queryByRole('status', { name: 'Unsaved changes' })).toBeNull();
    act(() => usePendingSave.getState().set(true));
    expect(within(tab('Gamma')).getByRole('status', { name: 'Unsaved changes' })).toBeInTheDocument();
    expect(within(tab('Alpha')).queryByRole('status')).toBeNull(); // only the open file has pending local edits
    act(() => usePendingSave.getState().set(false));
    expect(screen.queryByRole('status', { name: 'Unsaved changes' })).toBeNull();
    // a background tab with an unsent server upload
    setMeta(localStorage, a, { ...freshMeta({ baseVersion: 2 }), dirty: true, pending: 1 });
    act(() => usePendingSave.getState().set(true));
    act(() => usePendingSave.getState().set(false));
    expect(within(tab('Alpha')).getByRole('status', { name: 'Unsaved changes' })).toBeInTheDocument();
    // an .sdd file with changes since its last save
    act(() => useFileStore.setState({ fileName: 'x.sdd', dirty: true }));
    expect(within(tab('Gamma')).getByRole('status', { name: 'Unsaved changes' })).toBeInTheDocument();
  });

  it('the … menu lists every open file and reopens closed ones', () => {
    render(<Host />);
    fireEvent.click(screen.getByRole('button', { name: 'Open files list' }));
    const menu = screen.getByTestId('context-menu');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.querySelector('.ctx-label')?.textContent)).toEqual(['Alpha', 'Beta', '● Gamma', 'Reopen closed tab']);
    expect(within(menu).getByRole('menuitem', { name: /Reopen closed tab/ })).toBeDisabled();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Alpha' }));
    expect(ws().tabs.active).toBe(a);

    closeFileTab(b);
    fireEvent.click(screen.getByRole('button', { name: 'Open files list' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /Reopen closed tab/ }));
    expect(tabNames()).toEqual(['Alpha', 'Gamma', 'Beta']);
    expect(ws().tabs.active).toBe(b);
  });

  it('context menu: close, close others, reveal in files, star, rename', async () => {
    render(<Host />);
    fireEvent.contextMenu(tab('Beta'));
    const menu = screen.getByTestId('context-menu');
    expect(within(menu).getAllByRole('menuitem').map((m) => m.querySelector('.ctx-label')?.textContent)).toEqual(['Close', 'Close others', 'Show in file list', 'Add to starred', 'Rename…']);
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Add to starred' }));
    expect(ws().starred).toEqual([b]);
    fireEvent.contextMenu(tab('Beta'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Show in file list' }));
    expect(ws().filesOpen).toBe(true);
    expect(ws().focusId).toBe(b);
    fireEvent.contextMenu(tab('Beta'));
    fireEvent.click(screen.getByRole('menuitem', { name: /^Rename/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename file' });
    fireEvent.change(within(dialog).getByLabelText('Name'), { target: { value: 'Beta v2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Rename' }));
    expect(await screen.findByTestId('ftab-Beta v2')).toBeInTheDocument();
    expect(loadFile(localStorage, b)?.name).toBe('Beta v2');
    fireEvent.contextMenu(tab('Beta v2'));
    fireEvent.click(screen.getByRole('menuitem', { name: 'Close others' }));
    expect(ws().tabs.open).toEqual([b]);
  });

  it('keyboard: Enter activates, arrows move between tabs', () => {
    render(<Host />);
    fireEvent.keyDown(tab('Gamma'), { key: 'ArrowRight' });
    expect(ws().tabs.active).toBe(a);
    fireEvent.keyDown(tab('Alpha'), { key: 'ArrowLeft' });
    expect(ws().tabs.active).toBe(c);
    fireEvent.keyDown(tab('Beta'), { key: 'Enter' });
    expect(ws().tabs.active).toBe(b);
  });

  it('many tabs overflow into a scroll strip without breaking layout (the strip scrolls, the … button stays)', () => {
    for (let i = 0; i < 12; i++) createFileIn(null, `File ${i}`);
    render(<Host />);
    expect(document.querySelector('.ft-strip')).toBeTruthy();
    expect(screen.getAllByRole('tab')).toHaveLength(15);
    expect(screen.getByRole('button', { name: 'Open files list' })).toBeInTheDocument();
  });
});

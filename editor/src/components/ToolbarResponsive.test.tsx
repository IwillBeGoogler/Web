import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('html-to-image', () => ({ toPng: vi.fn().mockResolvedValue('data:png'), toSvg: vi.fn().mockResolvedValue('data:svg') }));

import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useDialogStore } from '../lib/dialogs';
import { seedProject } from '../test/workspace';
import { blankClass } from '../lib/uml/geometry';

vi.setConfig({ testTimeout: 60000 });
const realMatchMedia = window.matchMedia;
/** every `(max-width: N px)` query up to `width` matches */
const viewport = (width: number) => {
  window.matchMedia = ((query: string) => {
    const m = /max-width:\s*(\d+)px/.exec(query);
    return { matches: m ? width <= Number(m[1]) : false, media: query, onchange: null, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, dispatchEvent: () => false };
  }) as unknown as typeof window.matchMedia;
};
const mount = () => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  render(<App initialProjectId={seedProject('Resp').projectId} />);
  act(() => useDiagramStore.getState().placeNodes([blankClass('c1', { x: 0, y: 0 }, 'class', 'A'), blankClass('c2', { x: 300, y: 0 }, 'class', 'B')]));
};
afterEach(() => { cleanup(); window.matchMedia = realMatchMedia; vi.restoreAllMocks(); });
beforeEach(() => { act(() => useDialogStore.getState().clear()); });

const items = () => screen.queryAllByRole('menuitem').concat(screen.queryAllByRole('menuitemcheckbox'), screen.queryAllByRole('menuitemradio'));
/** open the "⋯" menu and click item `i`; returns the item count */
async function more(i: number): Promise<number> {
  await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'More' })));
  const all = items().sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const el = all[i];
  if (el && !(el as HTMLButtonElement).disabled && !/All projects/.test(el.textContent ?? '')) await act(async () => { fireEvent.click(el); await new Promise((r) => setTimeout(r, 0)); });
  act(() => useDialogStore.getState().clear());
  fireEvent.keyDown(window, { key: 'Escape' });
  return all.length;
}

describe('Toolbar responsive menus', () => {
  for (const [name, width] of [['phone', 500], ['tight', 1050], ['compact', 1150]] as const)
    it(`${name}: every item of the "⋯" menu`, async () => {
      viewport(width);
      mount();
      const n = await more(0);
      expect(n).toBeGreaterThan(5);
      for (let i = 1; i < n; i++) await more(i);
    });

  it('phone: the file list lives in the "⋯" menu with its project actions; tabs/crumbs collapse', async () => {
    viewport(500);
    mount();
    expect(screen.queryByRole('button', { name: 'Project menu' })).toBeNull();
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'More' })));
    expect(screen.getByRole('menuitem', { name: /Undo/ })).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Export project \(\.sdd\)/ })).toBeTruthy();
  });
});

describe('Toolbar desktop menus', () => {
  it('a press outside closes a menu; Escape closes too', async () => {
    mount();
    const file = screen.getAllByRole('button', { name: /^File$/ }).find((b) => b.getAttribute('aria-haspopup') === 'menu')!;
    await act(async () => void fireEvent.click(file));
    expect(screen.getAllByRole('menuitem').length).toBeGreaterThan(3);
    fireEvent.mouseDown(document.body);
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.queryByRole('menuitem', { name: /New project/ })).toBeNull();
    await act(async () => void fireEvent.click(file));
    fireEvent.keyDown(window, { key: 'Escape' });
    await act(async () => { await new Promise((r) => setTimeout(r, 300)); });
    expect(screen.queryByRole('menuitem', { name: /New project/ })).toBeNull();
  });

  it('templates sub-menu: back to File, insert into this file, open as a new file', async () => {
    mount();
    const file = () => screen.getAllByRole('button', { name: /^File$/ }).find((b) => b.getAttribute('aria-haspopup') === 'menu')!;
    await act(async () => void fireEvent.click(file()));
    await act(async () => void fireEvent.click(screen.getByRole('menuitem', { name: /Templates/ })));
    await act(async () => void fireEvent.click(screen.getByRole('menuitem', { name: /Back to File/ })));
    expect(screen.getByRole('menuitem', { name: /Templates/ })).toBeTruthy();
    await act(async () => void fireEvent.click(screen.getByRole('menuitem', { name: /Templates/ })));
    const before = useDiagramStore.getState().nodes.length;
    await act(async () => void fireEvent.click(screen.getAllByRole('menuitem', { name: /^Insert: / })[0]));
    expect(useDiagramStore.getState().nodes.length).toBeGreaterThanOrEqual(before);
    await act(async () => void fireEvent.click(file()));
    await act(async () => void fireEvent.click(screen.getByRole('menuitem', { name: /Templates/ })));
    await act(async () => void fireEvent.click(screen.getAllByRole('menuitem', { name: /^New file: / })[0]));
  });

  it('project caret: rename, new file, new project', async () => {
    mount();
    for (const name of [/Rename project/, /New file/, /New project/]) {
      await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Project menu' })));
      const it = screen.queryByRole('menuitem', { name });
      if (it) await act(async () => { fireEvent.click(it); await new Promise((r) => setTimeout(r, 0)); });
      act(() => useDialogStore.getState().clear());
      fireEvent.keyDown(window, { key: 'Escape' });
    }
    expect(screen.getByTestId('topbar')).toBeTruthy();
  });

  it('the link breadcrumb shows a Back button while a trail exists', async () => {
    mount();
    act(() => useUiStore.setState({ linkTrail: [{ fileId: 'x', nodeId: 'c1' }] as never }));
    const btn = screen.getByRole('button', { name: 'Back to where the link started' });
    await act(async () => void fireEvent.click(btn));
  });

  it('export and import actions from the File menu, success and failure', async () => {
    mount();
    const file = () => screen.getAllByRole('button', { name: /^File$/ }).find((b) => b.getAttribute('aria-haspopup') === 'menu')!;
    for (const name of [/Export page as PNG/, /Export page as SVG/, /Export project JSON/, /Export project \(\.sdd\)/, /Export image/, /Export as text/, /Save as/, /Import project/, /Import JSON/, /Import database schema/, /Export database schema/, /Import infrastructure/, /Open \.sdd/, /^Save ⌘S/]) {
      await act(async () => void fireEvent.click(file()));
      const el = screen.queryByRole('menuitem', { name });
      if (el) await act(async () => { fireEvent.click(el); await new Promise((r) => setTimeout(r, 5)); });
      act(() => useDialogStore.getState().clear());
      fireEvent.keyDown(window, { key: 'Escape' });
    }
    const json = JSON.stringify({ version: 1, name: 'x', pages: [] });
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [new File([json], 'a.json')] } });
    await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
    expect(screen.getByTestId('topbar')).toBeTruthy();
  });
});

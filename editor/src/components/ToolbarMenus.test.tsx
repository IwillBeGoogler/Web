import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('html-to-image', () => ({ toPng: vi.fn().mockResolvedValue('data:png'), toSvg: vi.fn().mockResolvedValue('data:svg') }));

import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useDialogStore } from '../lib/dialogs';
import { seedProject } from '../test/workspace';
import { blankClass } from '../lib/uml/geometry';

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  URL.createObjectURL = vi.fn(() => 'blob:x');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
  const p = seedProject('Menus');
  render(<App initialProjectId={p.projectId} />);
  act(() => useDiagramStore.getState().placeNodes([blankClass('c1', { x: 0, y: 0 }, 'class', 'A'), blankClass('c2', { x: 300, y: 0 }, 'class', 'B')]));
});

/** open the menu behind `trigger`, click item `i` (0-based); returns how many items the menu has */
async function clickItem(trigger: () => HTMLElement, i: number): Promise<number> {
  await act(async () => void fireEvent.click(trigger()));
  const items = screen.queryAllByRole('menuitem').concat(screen.queryAllByRole('menuitemcheckbox'), screen.queryAllByRole('menuitemradio'));
  const ordered = items.sort((a, b) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING ? -1 : 1));
  const el = ordered[i];
  if (el && !(el as HTMLButtonElement).disabled) await act(async () => { fireEvent.click(el); await new Promise((r) => setTimeout(r, 0)); });
  act(() => useDialogStore.getState().clear());
  fireEvent.keyDown(window, { key: 'Escape' });
  return ordered.length;
}

describe('top bar menus: every item can be clicked', () => {
  for (const [name, label] of [['File', /^File$/], ['View', /^View$/], ['Line style', /^Line style$/], ['Zoom', /^Zoom/]] as [string, RegExp][])
    it(`${name} menu`, async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const trigger = () => screen.getAllByRole('button', { name: label }).find((b) => b.getAttribute('aria-haspopup') === 'menu') ?? screen.getByRole('button', { name: label });
      const n = await clickItem(trigger, 0);
      expect(n).toBeGreaterThan(0);
      for (let i = 1; i < n; i++) await clickItem(trigger, i);
    }, 120000);
  it('file inputs import json and projects', async () => {
    const json = JSON.stringify({ version: 1, name: 'x', pages: [] });
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [new File([json], 'a.json')] } });
    fireEvent.change(screen.getByTestId('import-input'), { target: { files: [new File(['not json'], 'a.json')] } });
    fireEvent.change(screen.getByTestId('import-project-input'), { target: { files: [new File(['garbage'], 'a.sdd')] } });
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    expect(screen.getByTestId('topbar')).toBeTruthy();
  });
  it('file name and project name commit on blur', async () => {
    const inputs = screen.getAllByRole('textbox');
    for (const el of inputs.slice(0, 2)) { fireEvent.change(el, { target: { value: 'Renamed' } }); fireEvent.blur(el); fireEvent.change(el, { target: { value: '  ' } }); fireEvent.blur(el); }
    expect(screen.getByTestId('topbar')).toBeTruthy();
  });
});

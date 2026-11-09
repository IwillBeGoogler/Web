import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('html-to-image', () => ({ toPng: vi.fn().mockResolvedValue('data:png'), toSvg: vi.fn().mockResolvedValue('data:svg') }));

import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useDialogStore } from '../lib/dialogs';
import { createStoredProject } from '../lib/projects';
import { blankClass } from '../lib/uml/geometry';

const openK = async () => {
  await act(async () => { useUiStore.setState({ commandOpen: false }); });
  await act(async () => { useUiStore.setState({ commandOpen: true }); });
};
const input = () => screen.getByLabelText('Command') as HTMLInputElement;
const titles = () => screen.queryAllByRole('option').map((o) => o.textContent ?? '');

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  const p = createStoredProject(localStorage, 'Cmd');
  render(<App initialProjectId={p.id} />);
});

describe('command palette: every reachable command runs without throwing', () => {
  it('collects commands by section keyword then runs each one', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => {
      useDiagramStore.getState().placeNodes([blankClass('c1', { x: 0, y: 0 }, 'class', 'Account'), blankClass('c2', { x: 300, y: 0 }, 'class', 'Order')]);
      useDiagramStore.getState().selectAll();
    });
    const queries = ['uml', 'timing', 'sequence', 'state', 'board', 'mind map', 'design', 'layout', 'tidy', 'database', 'er ', 'smart', 'template', 'new file from', 'insert template', 'export', 'view', 'toggle', 'component', 'auto layout', 'sticky', 'tree', 'import', 'add', 'deployment', 'package', 'object', 'communication', 'activity', 'use case', 'line style', 'undo', 'group', 'help', 'file', 'settings', 'capacity', 'simulat', 'metrics', 'diff', 'timeline', 'problem', 'outline', 'rulers', 'dev', 'plugin', 'link', 'frame', 'present', 'private', 'migration'];
    const done = new Set<string>();
    let ran = 0;
    for (const q of queries) {
      await openK();
      await act(async () => void fireEvent.change(input(), { target: { value: q } }));
      const n = titles().length;
      for (let i = 0; i < n; i++) {
        await openK();
        await act(async () => void fireEvent.change(input(), { target: { value: q } }));
        const opts = screen.queryAllByRole('option');
        const o = opts[i];
        if (!o || done.has(o.textContent ?? '')) continue;
        done.add(o.textContent ?? '');
        await act(async () => { fireEvent.keyDown(input(), { key: 'ArrowDown' }); fireEvent.keyDown(input(), { key: 'ArrowUp' }); });
        await act(async () => void fireEvent.mouseDown(o));
        await act(async () => { await Promise.resolve(); });
        act(() => useDialogStore.getState().clear());
        ran++;
      }
    }
    expect(ran).toBeGreaterThan(100);
  }, 600000);
});

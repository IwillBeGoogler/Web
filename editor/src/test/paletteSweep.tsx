import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
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

/** every keyword the palette is searched with: together they list all commands */
const QUERIES = ['uml', 'timing', 'sequence', 'state', 'board', 'mind map', 'design', 'layout', 'tidy', 'database', 'er ', 'smart', 'template', 'new file from', 'insert template', 'export', 'view', 'toggle', 'component', 'auto layout', 'sticky', 'tree', 'import', 'add', 'deployment', 'package', 'object', 'communication', 'activity', 'use case', 'line style', 'undo', 'group', 'help', 'file', 'settings', 'capacity', 'simulat', 'metrics', 'diff', 'timeline', 'problem', 'outline', 'rulers', 'dev', 'plugin', 'link', 'frame', 'present', 'private', 'migration'];

/** stable split of the commands over the sweep files (FNV-1a of the title) */
const partOf = (title: string, parts: number): number => {
  let h = 2166136261;
  for (let i = 0; i < title.length; i++) h = Math.imul(h ^ title.charCodeAt(i), 16777619);
  return (h >>> 0) % parts;
};

/**
 * Runs the palette commands that belong to `part` (0-based, of `parts`) once each and checks none throws. The sweep is split
 * over several test files (CommandPaletteAll.test.tsx, CommandPaletteSweep.*.test.tsx): one file of ~150 s would pin a single
 * CI shard while the others finish in 90 s. Every file lists every keyword (cheap) but only runs its own share of the commands.
 */
export function sweepPalette(part: number, parts: number, minimum: number): void {
  beforeEach(() => {
    localStorage.clear();
    useDiagramStore.getState().reset();
    useUiStore.getState().resetUi();
    const p = createStoredProject(localStorage, 'Cmd');
    render(<App initialProjectId={p.id} />);
  });

  it(`runs palette commands, part ${part + 1}/${parts}`, async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    act(() => {
      useDiagramStore.getState().placeNodes([blankClass('c1', { x: 0, y: 0 }, 'class', 'Account'), blankClass('c2', { x: 300, y: 0 }, 'class', 'Order')]);
      useDiagramStore.getState().selectAll();
    });
    const done = new Set<string>();
    let ran = 0;
    for (const q of QUERIES) {
      await openK();
      await act(async () => void fireEvent.change(input(), { target: { value: q } }));
      const listed = titles();
      for (let i = 0; i < listed.length; i++) {
        const title = listed[i] ?? '';
        if (done.has(title) || partOf(title, parts) !== part) continue; // another query already ran it, or another file owns it
        await openK();
        await act(async () => void fireEvent.change(input(), { target: { value: q } }));
        const o = screen.queryAllByRole('option')[i];
        if (!o || done.has(o.textContent ?? '')) continue;
        done.add(o.textContent ?? '');
        await act(async () => { fireEvent.keyDown(input(), { key: 'ArrowDown' }); fireEvent.keyDown(input(), { key: 'ArrowUp' }); });
        await act(async () => void fireEvent.mouseDown(o));
        await act(async () => { await Promise.resolve(); });
        act(() => useDialogStore.getState().clear());
        ran++;
      }
    }
    expect(ran).toBeGreaterThan(minimum);
  }, 600000);
}

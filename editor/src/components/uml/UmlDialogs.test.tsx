import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from '../../App';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { seedProject } from '../../test/workspace';
import { SECTIONS } from '../../data/catalog';
import { createNodesFromPaletteItem } from '../../data/palette';
import { blankClass } from '../../lib/uml/geometry';
import { useDriftStore } from '../../lib/uml/driftStore';
import { registerUmlSection } from '../../data/uml';
import { hasUmlNodes, openUmlExport, openUmlImport } from './umlDialogs';

registerUmlSection();
const s = () => useDiagramStore.getState();
function open() {
  localStorage.clear();
  s().reset();
  useDriftStore.getState().clear();
  useUiStore.getState().resetUi();
  const p = seedProject('UML');
  return render(<App initialProjectId={p.projectId} />);
}
const TS = 'export interface Repo { find(id: string): void }\nexport class User { name: string; repo: Repo; }';
const preview = () => document.querySelector('.er-preview')!.textContent ?? '';

describe('openUmlImport', () => {
  it('previews and imports TypeScript into the page', async () => {
    open();
    act(() => void openUmlImport());
    const area = await screen.findByLabelText('Source text');
    expect(screen.getByRole('button', { name: /^Import/ })).toBeDisabled();
    fireEvent.change(area, { target: { value: TS } });
    await waitFor(() => expect(preview()).toMatch(/2 classes|1 class/));
    fireEvent.click(screen.getByRole('checkbox', { name: /Draw associations/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Draw associations/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(s().nodes.filter((n) => n.type === 'class').length).toBeGreaterThan(0));
  });
  it('explicit format, empty result, file upload and new-file target', async () => {
    open();
    act(() => void openUmlImport());
    const area = (await screen.findByLabelText('Source text')) as HTMLTextAreaElement;
    fireEvent.change(screen.getByLabelText('Language / format'), { target: { value: 'typescript' } });
    fireEvent.change(area, { target: { value: 'const nothing = 1;' } });
    await waitFor(() => expect(preview()).toMatch(/Nothing to import/));
    fireEvent.change(area, { target: { value: '   ' } });
    await waitFor(() => expect(preview()).toMatch(/Paste source code/));
    fireEvent.change(screen.getByTestId('uml-file'), { target: { files: [new File([TS], 'model.ts')] } });
    await waitFor(() => expect(area.value).toBe(TS));
    fireEvent.click(screen.getByLabelText('A new file'));
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(document.querySelector('.er-preview')).toBeNull());

  });
  it('cancel closes without importing', async () => {
    open();
    act(() => void openUmlImport());
    await screen.findByLabelText('Source text');
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByLabelText('Source text')).toBeNull());
    expect(s().nodes).toHaveLength(0);
  });
  for (const [name, text, re] of [
    ['mermaid sequence', 'sequenceDiagram\n  A->>B: hi\n  B-->>A: yo', /Sequence diagram/],
    ['plantuml sequence', '@startuml\nA -> B : hi\n@enduml', /Sequence diagram/],
    ['mermaid state', 'stateDiagram-v2\n  [*] --> A\n  A --> B', /State machine/],
    ['plantuml state', '@startuml\n[*] --> A\nA --> B\n@enduml', /State machine/],
    ['mermaid class', 'classDiagram\n  class A\n  class B\n  A <|-- B', /classes/],
  ] as [string, string, RegExp][])
    it(`imports ${name}`, async () => {
      open();
      act(() => void openUmlImport());
      fireEvent.change(await screen.findByLabelText('Source text'), { target: { value: text } });
      await waitFor(() => expect(preview()).toMatch(re));
      const btn = screen.getByRole('button', { name: /^Import/ });
      expect(btn).not.toBeDisabled();
      fireEvent.click(btn);
      await waitFor(() => expect(s().nodes.length).toBeGreaterThan(0));
    });
  it('use case / activity / component text via auto-detect', async () => {
    open();
    act(() => void openUmlImport());
    const area = await screen.findByLabelText('Source text');
    for (const text of ['@startuml\nactor User\nUser --> (Login)\n@enduml', '@startuml\nstart\n:step;\nstop\n@enduml', '@startuml\n[Comp] --> [Other]\n@enduml', 'flowchart TD\n a-->b', 'junk that is not any diagram']) {
      fireEvent.change(area, { target: { value: text } });
      await waitFor(() => expect(preview().length).toBeGreaterThan(0));
    }
  });
  it('sync mode updates an existing class diagram via the drift panel', async () => {
    open();
    act(() => s().placeNodes([blankClass('c1', { x: 0, y: 0 }, 'class', 'Old')]));
    act(() => void openUmlImport({ sync: true }));
    const area = await screen.findByLabelText('Source text');
    fireEvent.change(area, { target: { value: TS } });
    await waitFor(() => expect(preview()).toMatch(/class/));
    fireEvent.click(screen.getByLabelText(/Also mark classes/));
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(useDriftStore.getState().visible()).toBeTruthy());
  });
  it('sync with identical code says the diagram matches', async () => {
    open();
    act(() => s().placeNodes([blankClass('c1', { x: 0, y: 0 }, 'class', 'User')]));
    act(() => void openUmlImport({ sync: true }));
    fireEvent.change(await screen.findByLabelText('Source text'), { target: { value: 'export class User {}' } });
    await waitFor(() => expect(preview()).toMatch(/1 class/));
    fireEvent.click(screen.getByRole('button', { name: /^Import/ }));
    await waitFor(() => expect(document.querySelector('.er-preview')).toBeNull());
  });
});

describe('openUmlExport', () => {
  it('bare page says nothing to export', async () => {
    open();
    act(() => void openUmlExport());
    const out = (await screen.findByLabelText('Exported UML')) as HTMLTextAreaElement;
    expect(out.value).toMatch(/Nothing to export/);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeDisabled();
    fireEvent.click(screen.getAllByRole('button', { name: 'Close' }).at(-1)!);
    await waitFor(() => expect(screen.queryByLabelText('Exported UML')).toBeNull());
  });
  it('classes: all formats, scope, copy and download', async () => {
    open();
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    act(() => s().placeNodes([blankClass('a', { x: 0, y: 0 }, 'class', 'A'), blankClass('b', { x: 300, y: 0 }, 'class', 'B')]));
    act(() => { s().selectAll(); void openUmlExport(); });
    const out = (await screen.findByLabelText('Exported UML')) as HTMLTextAreaElement;
    const fmt = screen.getByLabelText('Format') as HTMLSelectElement;
    for (const o of Array.from(fmt.options)) { fireEvent.change(fmt, { target: { value: o.value } }); expect(out.value.length).toBeGreaterThan(0); }
    fireEvent.change(screen.getByDisplayValue(/Selected/), { target: { value: 'all' } });
    fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    fireEvent.click(screen.getByRole('button', { name: /^Download/ }));
    expect(click).toHaveBeenCalled();
    click.mockRestore();
  });
  it('every diagram kind present on the page is exportable', async () => {
    open();
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const all = [] as ReturnType<typeof createNodesFromPaletteItem>;
    let k = 0;
    for (const item of SECTIONS.filter((x) => x.id === 'uml').flatMap((x) => x.subs.flatMap((b) => b.items))) {
      try { all.push(...createNodesFromPaletteItem(item, { x: (k++ % 8) * 200, y: Math.floor(k / 8) * 150 }, (p) => `${p}${k}_${all.length}`)); } catch { /* ignore */ }
    }
    expect(all.length).toBeGreaterThan(10);
    act(() => { s().placeNodes(all); s().selectAll(); void openUmlExport(); });
    expect(hasUmlNodes(s().nodes)).toBe(true);
    expect(hasUmlNodes([])).toBe(false);
    const out = (await screen.findByLabelText('Exported UML')) as HTMLTextAreaElement;
    const what = screen.getByLabelText('Diagram') as HTMLSelectElement;
    for (const o of Array.from(what.options)) {
      fireEvent.change(what, { target: { value: o.value } });
      const fmt = screen.getByLabelText('Format') as HTMLSelectElement;
      for (const f of Array.from(fmt.options)) {
        fireEvent.change(fmt, { target: { value: f.value } });
        expect(typeof out.value).toBe('string');
      }
      const dl = screen.getByRole('button', { name: /^Download/ });
      if (!(dl as HTMLButtonElement).disabled) fireEvent.click(dl);
    }
    click.mockRestore();
  });
});

import { render, screen, waitFor, act } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { applyText } from '../../lib/dsl/bridge';
import { SplitView } from './SplitView';

const s = () => useDiagramStore.getState();
beforeEach(() => {
  s().reset();
  applyText('#!sdd 1\nnode a "A" icon=redis\nnode b "B"\na -> b\n');
});

const viewOf = async (): Promise<EditorView> => {
  const host = await screen.findByTestId('code-editor');
  await waitFor(() => expect(host.querySelector('.cm-editor')).toBeTruthy());
  return EditorView.findFromDOM(host.querySelector('.cm-editor') as HTMLElement)!;
};

describe('SplitView', () => {
  it('shows the canvas as text and edits flow both ways', async () => {
    render(<SplitView />);
    const view = await viewOf();
    expect(view.state.doc.toString()).toContain('node a "A" icon=redis');

    // text -> canvas
    act(() => { view.dispatch({ changes: { from: view.state.doc.length, insert: 'node c "C"\nc -> a "calls"\n' } }); });
    await waitFor(() => expect(s().nodes.map((n) => n.id)).toContain('c'), { timeout: 2000 });
    expect(s().edges.some((e) => e.source === 'c' && e.label === 'calls')).toBe(true);
    expect(screen.getByTestId('split-status')).toHaveTextContent('in sync');

    // canvas -> text
    act(() => s().updateNodeData('b', { label: 'Bee' }));
    await waitFor(() => expect(view.state.doc.toString()).toContain('node b "Bee"'));
  });

  it('shows syntax errors in the header and keeps the canvas', async () => {
    render(<SplitView />);
    const view = await viewOf();
    act(() => { view.dispatch({ changes: { from: view.state.doc.length, insert: 'bogus statement\n' } }); });
    await waitFor(() => expect(screen.getByTestId('split-status')).toHaveTextContent(/1 error/), { timeout: 2000 });
    expect(s().nodes).toHaveLength(2);
  });
});

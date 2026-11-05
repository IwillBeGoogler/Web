import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { seedProject } from '../../test/workspace';
import { blankTiming, timingOf } from '../../lib/timing/node';
import { layoutTiming, xOf } from '../../lib/timing/layout';
import { executeAction } from '../../lib/actions';
import { objectModelToDiagram } from '../../lib/object/convert';
import { messagesOfLink } from '../../lib/communication/messages';

const s = () => useDiagramStore.getState();
function open() {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  const p = seedProject('Timing');
  return render(<App initialProjectId={p.projectId} />);
}
const select = (id: string) => act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: n.id === id })) })));
const data = () => timingOf(s().nodes.find((n) => n.type === 'timing')!);

describe('TimingNode', () => {
  beforeEach(() => {
    open();
    act(() => s().addNode(blankTiming('tm', { x: 0, y: 0 }, 'Login')));
  });

  it('draws the title, lifeline names, hexagon bands for concise, a step line for robust, ticks and messages', () => {
    expect(screen.getByText('td Login')).toBeInTheDocument();
    expect(Array.from(document.querySelectorAll('.tm-life-name')).map((e) => e.textContent)).toEqual(['User', 'Server']);
    expect(document.querySelectorAll('.tm-hex').length).toBe(3);
    expect(document.querySelectorAll('.tm-signal').length).toBe(1);
    expect(document.querySelectorAll('.tm-tick-text').length).toBeGreaterThan(5);
    expect(document.querySelectorAll('.tm-msg').length).toBe(1);
    expect(document.querySelectorAll('.tm-con').length).toBe(1);
  });

  it('the toolbar shows only while selected; it adds a lifeline of a chosen kind, a message and a constraint (one undo step each)', () => {
    expect(screen.queryByRole('toolbar', { name: 'Timing tools' })).toBeNull();
    select('tm');
    const bar = screen.getByRole('toolbar', { name: 'Timing tools' });
    fireEvent.change(within(bar).getByRole('combobox', { name: 'Add lifeline' }), { target: { value: 'binary' } });
    expect(data().lifelines.map((l) => l.kind)).toEqual(['concise', 'robust', 'binary']);
    expect(document.querySelectorAll('.tm-life').length).toBe(3);
    fireEvent.click(within(bar).getByRole('button', { name: 'Add message between lifelines' }));
    expect(data().messages).toHaveLength(2);
    act(() => s().undo());
    expect(data().messages).toHaveLength(1);
    act(() => s().undo());
    expect(data().lifelines).toHaveLength(2);
  });

  it('clicking a lifeline track of the selected frame adds a state change at that time (not before it is selected)', () => {
    const track = screen.getByTestId('tm-track-l2');
    const L = layoutTiming(data());
    const before = data().changes.length;
    const at = (t: number) => ({ clientX: xOf(L, t), clientY: L.lifelines[1].y + 8 });
    // jsdom has no layout: the svg rect is all zeros, so the click maps to x0 + clientX; fine for the assertion below
    fireEvent.pointerDown(track, at(50));
    fireEvent.click(track, at(50));
    expect(data().changes).toHaveLength(before);
    select('tm');
    fireEvent.pointerDown(track, at(50));
    fireEvent.click(track, at(50));
    expect(data().changes).toHaveLength(before + 1);
    expect(document.querySelectorAll('.tm-chg').length).toBe(before + 1);
  });

  it('double click on a change renames its state; Enter commits', () => {
    select('tm');
    fireEvent.doubleClick(screen.getByTestId('tm-chg-c2'));
    const input = screen.getByRole('textbox', { name: 'State name' });
    fireEvent.change(input, { target: { value: 'Blocked' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(data().changes.find((c) => c.id === 'c2')?.state).toBe('Blocked');
    expect(data().lifelines[0].states).toContain('Blocked');
  });

  it('the inspector edits the unit, the axis end and the lifelines', () => {
    select('tm');
    fireEvent.change(screen.getByRole('textbox', { name: 'Time unit' }), { target: { value: 'us' } });
    fireEvent.blur(screen.getByRole('textbox', { name: 'Time unit' }));
    expect(data().unit).toBe('us');
    fireEvent.click(screen.getByRole('button', { name: 'Remove lifeline Server' }));
    expect(data().lifelines.map((l) => l.id)).toEqual(['l1']);
    expect(data().messages).toEqual([]);
  });

  it('the Tidy action sorts and fits the axis', () => {
    act(() => s().updateTiming('tm', (d) => ({ ...d, end: 50 })));
    act(() => executeAction('tidy-timing'));
    expect(data().end).toBeGreaterThanOrEqual(300);
  });
});

describe('communication messages', () => {
  beforeEach(() => {
    open();
    const d = objectModelToDiagram({ objects: [{ id: 'a', name: 'a', slots: [] }, { id: 'b', name: 'b', slots: [] }], links: [{ from: 'a', to: 'b' }] });
    act(() => s().insertContent(d));
  });

  it('the command adds a numbered message to the selected link; the inspector edits, nests and renumbers it', () => {
    const edge = s().edges[0];
    act(() => useDiagramStore.setState((st) => ({ edges: st.edges.map((e) => ({ ...e, selected: e.id === edge.id })), nodes: st.nodes.map((n) => ({ ...n, selected: false })) })));
    act(() => executeAction('comm-add-message'));
    act(() => executeAction('comm-add-message'));
    expect(messagesOfLink(s().edges, edge.id).map((m) => m.seq)).toEqual(['1', '2']);
    const row = screen.getByTestId(`comm-row-${messagesOfLink(s().edges, edge.id)[1].id}`);
    fireEvent.click(within(row).getByRole('button', { name: 'Nest under the previous message (1 → 1.1)' }));
    expect(messagesOfLink(s().edges, edge.id).map((m) => m.seq)).toEqual(['1', '1.1']);
    fireEvent.click(within(screen.getByTestId(`comm-row-${messagesOfLink(s().edges, edge.id)[0].id}`)).getByRole('button', { name: 'Remove message' }));
    expect(messagesOfLink(s().edges, edge.id).map((m) => m.seq)).toEqual(['1']);
    expect(s().edges[0].label).toBe('1: message() →');
  });
});

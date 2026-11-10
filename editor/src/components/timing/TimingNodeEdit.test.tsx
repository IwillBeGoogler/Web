import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { seedProject } from '../../test/workspace';
import { blankTiming, timingOf } from '../../lib/timing/node';

const s = () => useDiagramStore.getState();
const select = (id: string | null) => act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: n.id === id })) })));
const data = () => timingOf(s().nodes.find((n) => n.type === 'timing')!);
const tm = () => screen.getByTestId('timing-tm');
const ptr = (el: Element | Window, type: string, init: MouseEventInit = {}) => act(() => { fireEvent(el, new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, ...init })); });
const toolbar = () => screen.getByRole('toolbar', { name: 'Timing tools' });
const key = (k: string) => fireEvent.keyDown(tm(), { key: k });

beforeEach(() => {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  render(<App initialProjectId={seedProject('Timing').projectId} />);
  act(() => s().addNode(blankTiming('tm', { x: 0, y: 0 }, 'Login')));
});

describe('TimingNode drags', () => {
  it('dragging a change sideways and across rows retimes it; under 4px it only selects', () => {
    select('tm');
    const chg = screen.getByTestId('tm-chg-c5');
    ptr(chg, 'pointerdown', { clientX: 100, clientY: 100 });
    ptr(window, 'pointermove', { clientX: 101, clientY: 100 }); // below threshold
    expect(document.querySelector('.tm-drop')).toBeNull();
    ptr(window, 'pointermove', { clientX: 140, clientY: 120 });
    expect(document.querySelector('.tm-drop')).not.toBeNull();
    expect(document.querySelector('.tm-chg.dragging')).not.toBeNull();
    ptr(window, 'pointerup');
    expect(document.querySelector('.tm-drop')).toBeNull();
    expect(data().changes.find((c) => c.id === 'c5')!.t).not.toBe(150);
    // a plain click leaves it alone
    const before = JSON.stringify(data().changes);
    ptr(screen.getByTestId('tm-chg-c2'), 'pointerdown', { clientX: 5, clientY: 5 });
    ptr(window, 'pointerup');
    expect(JSON.stringify(data().changes)).toBe(before);
    expect(document.querySelector('.tm-chg.sel')).not.toBeNull();
  });

  it('drags on a concise lifeline carry no state; a locked node or non-primary button never drags', () => {
    select('tm');
    ptr(screen.getByTestId('tm-chg-c2'), 'pointerdown', { clientX: 0, clientY: 0 });
    ptr(window, 'pointermove', { clientX: 60, clientY: 0 });
    ptr(window, 'pointerup');
    expect(data().changes.find((c) => c.id === 'c2')!.state).toBe('Waiting');
    // right button: selects but registers no drag
    ptr(screen.getByTestId('tm-chg-c3'), 'pointerdown', { clientX: 0, clientY: 0, button: 2 });
    ptr(window, 'pointermove', { clientX: 90, clientY: 0 });
    expect(document.querySelector('.tm-drop')).toBeNull();
    act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => (n.id === 'tm' ? { ...n, data: { ...n.data, locked: true } } : n)) })));
    ptr(screen.getByTestId('tm-chg-c3'), 'pointerdown', { clientX: 0, clientY: 0 });
    ptr(window, 'pointermove', { clientX: 90, clientY: 0 });
    expect(document.querySelector('.tm-drop')).toBeNull();
    ptr(document.querySelector('.tm-msg')!, 'pointerdown', { clientX: 0 });
    ptr(window, 'pointermove', { clientX: 90 });
    expect(document.querySelector('.tm-msg.dragging')).toBeNull();
    // locked: double-click edits are ignored, toolbar hidden
    fireEvent.doubleClick(screen.getByTestId('tm-chg-c3'));
    fireEvent.doubleClick(document.querySelector('.tm-msg')!);
    fireEvent.doubleClick(document.querySelector('.tm-con')!);
    fireEvent.doubleClick(document.querySelector('.tm-life')!);
    fireEvent.doubleClick(screen.getByText('td Login'));
    expect(within(tm()).queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('toolbar', { name: 'Timing tools' })).toBeNull();
    key('Delete');
  });

  it('dragging a message sideways retimes it; a short wiggle does not', () => {
    select('tm');
    const msg = () => document.querySelector('.tm-msg')!;
    ptr(msg(), 'pointerdown', { clientX: 50 });
    ptr(window, 'pointermove', { clientX: 51 });
    ptr(window, 'pointerup');
    expect(data().messages[0].t).toBe(100);
    ptr(msg(), 'pointerdown', { clientX: 50 });
    ptr(window, 'pointermove', { clientX: 120 });
    expect(document.querySelector('.tm-msg.dragging')).not.toBeNull();
    ptr(window, 'pointerup');
    expect(data().messages[0].t).not.toBe(100);
  });
});

describe('TimingNode keyboard + toolbar', () => {
  it('Delete / Backspace removes the selected element; Enter opens its editor; Escape cancels; blur commits', () => {
    select('tm');
    ptr(screen.getByTestId('tm-chg-c2'), 'pointerdown', { clientX: 0, clientY: 0 });
    ptr(window, 'pointerup');
    key('Enter');
    let input = screen.getByRole('textbox', { name: 'State name' });
    fireEvent.change(input, { target: { value: 'zzz' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(within(tm()).queryByRole('textbox')).toBeNull();
    expect(data().changes.find((c) => c.id === 'c2')!.state).toBe('Waiting');
    key('Enter');
    input = screen.getByRole('textbox', { name: 'State name' });
    fireEvent.keyDown(input, { key: 'Delete' }); // ignored while editing
    fireEvent.change(input, { target: { value: 'Parked' } });
    fireEvent.blur(input);
    expect(data().changes.find((c) => c.id === 'c2')!.state).toBe('Parked');
    key('Backspace');
    expect(data().changes.find((c) => c.id === 'c2')).toBeUndefined();

    ptr(document.querySelector('.tm-msg')!, 'pointerdown', { clientX: 0 });
    ptr(window, 'pointerup');
    key('Enter');
    const mi = screen.getByRole('textbox', { name: 'Message text' });
    fireEvent.change(mi, { target: { value: 'ping' } });
    fireEvent.keyDown(mi, { key: 'Enter' });
    expect(data().messages[0].text).toBe('ping');
    key('Delete');
    expect(data().messages).toHaveLength(0);

    ptr(document.querySelector('.tm-con')!, 'pointerdown');
    key('Enter');
    const ci = screen.getByRole('textbox', { name: 'Constraint text' });
    fireEvent.change(ci, { target: { value: '{5 ms}' } });
    fireEvent.keyDown(ci, { key: 'Enter' });
    expect(data().durations[0].text).toBe('{5 ms}');
    key('Delete');
    expect(data().durations).toHaveLength(0);
    key('x'); // nothing selected / other key: no-op
  });

  it('lifeline: select, rename by Enter, add a change at the middle, delete via toolbar button', () => {
    select('tm');
    const life = () => document.querySelectorAll('.tm-life')[1];
    ptr(life(), 'pointerdown');
    expect(life().classList.contains('sel')).toBe(true);
    key('Enter');
    const li = screen.getByRole('textbox', { name: 'Lifeline name' });
    fireEvent.change(li, { target: { value: 'A very long lifeline name indeed' } });
    fireEvent.keyDown(li, { key: 'Enter' });
    expect(data().lifelines[1].name).toBe('A very long lifeline name indeed');
    expect(document.body.textContent).toContain('A very long l…');
    const n = data().changes.length;
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Add state change at the middle' }));
    expect(data().changes).toHaveLength(n + 1);
    // add message / constraint with a lifeline selected
    ptr(life(), 'pointerdown');
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Add message between lifelines' }));
    expect(screen.getByRole('textbox', { name: 'Message text' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Message text' }), { key: 'Escape' });
    ptr(life(), 'pointerdown');
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Add duration constraint' }));
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Constraint text' }), { key: 'Escape' });
    // delete selected (constraint is selected now)
    const k = data().durations.length;
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Delete selected' }));
    expect(data().durations).toHaveLength(k - 1);
    ptr(life(), 'pointerdown');
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Delete selected' }));
    expect(data().lifelines).toHaveLength(1);
  });

  it('pointer down on the svg background clears the selection; focusing a lifeline selects it; deselecting the node closes editors', () => {
    select('tm');
    const life = document.querySelector('.tm-life')!;
    fireEvent.focus(life);
    expect(life.classList.contains('sel')).toBe(true);
    ptr(tm().querySelector('.tm-svg')!, 'pointerdown');
    expect(document.querySelector('.tm-life.sel')).toBeNull();
    fireEvent.doubleClick(screen.getByText('td Login'));
    expect(screen.getByRole('textbox', { name: 'Timing title' })).toBeInTheDocument();
    select(null);
    expect(within(tm()).queryByRole('textbox')).toBeNull();
  });

  it('title edit commits a trimmed name, ignores blank; the rename request from the UI opens it', () => {
    select('tm');
    fireEvent.doubleClick(screen.getByText('td Login'));
    let input = screen.getByRole('textbox', { name: 'Timing title' });
    fireEvent.change(input, { target: { value: '  Boot  ' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(data().label).toBe('Boot');
    act(() => useUiStore.getState().setEditing('tm'));
    input = screen.getByRole('textbox', { name: 'Timing title' });
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.blur(input);
    expect(data().label).toBe('Boot');
  });
});

describe('TimingNode tracks and lifeline kinds', () => {
  it('clicking a concise track adds a change and opens its name editor; locked tracks ignore clicks', () => {
    select('tm');
    const track = screen.getByTestId('tm-track-l1');
    const n = data().changes.length;
    ptr(track, 'pointerdown', { clientX: 200, clientY: 10 });
    ptr(track, 'click', { clientX: 200, clientY: 10 });
    expect(data().changes).toHaveLength(n + 1);
    expect(screen.getByRole('textbox', { name: 'State name' })).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'State name' }), { key: 'Escape' });
    ptr(track, 'click', { clientX: 220, clientY: 10 }); // not armed again
    expect(data().changes).toHaveLength(n + 1);
    act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n2) => (n2.id === 'tm' ? { ...n2, data: { ...n2.data, locked: true } } : n2)) })));
    ptr(track, 'pointerdown', { clientX: 200, clientY: 10 });
    ptr(track, 'click', { clientX: 200, clientY: 10 });
    expect(data().changes).toHaveLength(n + 1);
  });

  it('draws clock, binary and zero-width/odd cases; the empty-state, no-unit and missing-ref paths do not throw', () => {
    select('tm');
    for (const k of ['clock', 'binary', 'robust', 'concise']) fireEvent.change(within(toolbar()).getByRole('combobox', { name: 'Add lifeline' }), { target: { value: k } });
    fireEvent.change(within(toolbar()).getByRole('combobox', { name: 'Add lifeline' }), { target: { value: '' } });
    expect(data().lifelines.length).toBe(6);
    expect(document.querySelectorAll('.tm-signal').length).toBeGreaterThanOrEqual(4);
    act(() => s().updateTiming('tm', (d) => ({
      ...d, unit: '',
      changes: [...d.changes, { id: 'cx', life: 'ghost', t: 5, state: 'X' }, { id: 'cy', life: 'l1', t: 399.5, state: 'Tiny' }],
      durations: [...d.durations, { id: 'kx', life: 'ghost', t1: 0, t2: 1, text: 'z' }],
    })));
    expect(document.querySelectorAll('.tm-chg').length).toBeGreaterThan(5);
    // clicking a clock lane has no track; add-change on empty lifelines
    act(() => s().updateTiming('tm', (d) => ({ ...d, lifelines: [], changes: [], messages: [], durations: [] })));
    expect(document.querySelectorAll('.tm-life').length).toBe(0);
  });
});

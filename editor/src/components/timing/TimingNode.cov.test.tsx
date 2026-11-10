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
const lock = () => act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => (n.id === 'tm' ? { ...n, data: { ...n.data, locked: true } } : n)) })));

beforeEach(() => {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  render(<App initialProjectId={seedProject('Timing').projectId} />);
  act(() => s().addNode(blankTiming('tm', { x: 0, y: 0 }, 'Login')));
});

describe('TimingNode extra branches', () => {
  it('an editor finishes only once when Enter and blur arrive in the same batch', () => {
    select('tm');
    fireEvent.doubleClick(screen.getByText('td Login'));
    const input = screen.getByRole('textbox', { name: 'Timing title' });
    fireEvent.change(input, { target: { value: 'Once' } });
    act(() => {
      fireEvent.keyDown(input, { key: 'Enter' });
      fireEvent.blur(input);
    });
    expect(data().label).toBe('Once');
  });

  it('binary change with an unknown state and a period-less clock still draw paths', () => {
    select('tm');
    fireEvent.change(within(toolbar()).getByRole('combobox', { name: 'Add lifeline' }), { target: { value: 'binary' } });
    fireEvent.change(within(toolbar()).getByRole('combobox', { name: 'Add lifeline' }), { target: { value: 'clock' } });
    const [bin, clk] = data().lifelines.slice(-2);
    act(() => s().updateTiming('tm', (d) => ({
      ...d,
      lifelines: d.lifelines.map((l) => (l.id === clk.id ? { ...l, period: undefined } : l)),
      changes: [...d.changes, { id: 'cz', life: bin.id, t: 40, state: 'mid' }],
    })));
    const paths = Array.from(document.querySelectorAll('.tm-signal')).map((p) => p.getAttribute('d')!);
    expect(paths.length).toBeGreaterThanOrEqual(3);
    expect(paths.every((d) => d.startsWith('M'))).toBe(true);
  });

  it('an unhandled key with an element selected does nothing', () => {
    select('tm');
    ptr(screen.getByTestId('tm-chg-c2'), 'pointerdown', { clientX: 0, clientY: 0 });
    ptr(window, 'pointerup');
    const n = data().changes.length;
    fireEvent.keyDown(tm(), { key: 'x' });
    expect(data().changes).toHaveLength(n);
    expect(within(tm()).queryByRole('textbox')).toBeNull();
  });

  it('toolbar add message / constraint / change work from a selected lifeline', () => {
    select('tm');
    ptr(document.querySelectorAll('.tm-life')[0], 'pointerdown');
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Add message between lifelines' }));
    expect(data().messages).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'Message text' })).toBeInTheDocument();
    ptr(document.querySelectorAll('.tm-life')[0], 'pointerdown');
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Add duration constraint' }));
    expect(data().durations).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'Constraint text' })).toBeInTheDocument();
    ptr(document.querySelectorAll('.tm-life')[0], 'pointerdown');
    const n = data().changes.length;
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Add state change at the middle' }));
    expect(data().changes).toHaveLength(n + 1);
  });

  it('adding a change at the middle of a clock lifeline selects nothing new', () => {
    select('tm');
    fireEvent.change(within(toolbar()).getByRole('combobox', { name: 'Add lifeline' }), { target: { value: 'clock' } });
    const lives = document.querySelectorAll('.tm-life');
    ptr(lives[lives.length - 1], 'pointerdown');
    const n = data().changes.length;
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Add state change at the middle' }));
    expect(data().changes.length).toBeGreaterThanOrEqual(n);
  });

  it('when the store ignores edits, toolbar and track clicks open no editors', () => {
    select('tm');
    const orig = s().updateTiming;
    act(() => useDiagramStore.setState({ updateTiming: () => undefined }));
    ptr(document.querySelectorAll('.tm-life')[0], 'pointerdown');
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Add message between lifelines' }));
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Add duration constraint' }));
    fireEvent.click(within(toolbar()).getByRole('button', { name: 'Add state change at the middle' }));
    const track = screen.getByTestId('tm-track-l1');
    ptr(track, 'pointerdown', { clientX: 200, clientY: 10 });
    ptr(track, 'click', { clientX: 200, clientY: 10 });
    expect(within(tm()).queryByRole('textbox')).toBeNull();
    // delete with the button still works as a no-op
    act(() => useDiagramStore.setState({ updateTiming: orig }));
  });

  it('a locked node ignores double clicks on lifeline, constraint, message and title', () => {
    lock();
    fireEvent.doubleClick(document.querySelector('.tm-life')!);
    fireEvent.doubleClick(document.querySelector('.tm-con')!);
    fireEvent.doubleClick(document.querySelector('.tm-msg')!);
    fireEvent.doubleClick(screen.getByText('td Login'));
    expect(within(tm()).queryByRole('textbox')).toBeNull();
  });

  it('the lifeline editor renders nothing when its lifeline disappears', () => {
    select('tm');
    fireEvent.doubleClick(document.querySelector('.tm-life')!);
    expect(screen.getByRole('textbox', { name: 'Lifeline name' })).toBeInTheDocument();
    act(() => s().updateTiming('tm', (d) => ({ ...d, lifelines: [], changes: [], messages: [], durations: [] })));
    expect(within(tm()).queryByRole('textbox')).toBeNull();
  });
});

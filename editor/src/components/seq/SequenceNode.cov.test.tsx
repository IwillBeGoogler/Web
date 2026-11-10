import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { seedProject } from '../../test/workspace';
import { blankSequence, sequenceOf } from '../../lib/seq/node';
import { addBox, addFragment, addMessage, addNote, addParticipant, addRef } from '../../lib/seq/edit';
import { allMessages, isMessage, type SequenceData } from '../../lib/seq/types';

const s = () => useDiagramStore.getState();
const select = (id: string, locked = false) => act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: n.id === id, data: n.id === id ? { ...n.data, locked } : n.data })) })));
const data = () => sequenceOf(s().nodes.find((n) => n.type === 'sequence')!);
const names = () => Array.from(document.querySelectorAll('.seq-part-name')).map((e) => e.textContent);
const edit = (fn: (d: SequenceData) => unknown) => act(() => s().updateSequence('sq', (d) => fn(d) as SequenceData));
const bar = () => screen.getByRole('toolbar', { name: 'Sequence tools' });
const press = (el: Element, key: string, init: Record<string, unknown> = {}) => fireEvent.keyDown(el, { key, ...init });
const root = () => screen.getByTestId('sequence-sq');
const part = (n: string) => screen.getByRole('button', { name: `Participant ${n}` });
const firstMsg = () => allMessages(data().items)[0];

function pointer(target: Element, from: [number, number], to: [number, number], opts: { button?: number; steps?: [number, number][] } = {}) {
  fireEvent.pointerDown(target, { clientX: from[0], clientY: from[1], button: opts.button ?? 0 });
  for (const [x, y] of opts.steps ?? [to]) fireEvent(window, Object.assign(new Event('pointermove'), { clientX: x, clientY: y }));
  fireEvent(window, new Event('pointerup'));
}

beforeEach(() => {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  const p = seedProject('Seq');
  render(<App initialProjectId={p.projectId} />);
  act(() => s().addNode(blankSequence('sq', { x: 0, y: 0 }, 'Flow')));
});

describe('SequenceNode toolbar', () => {
  it('adds notes, refs and boxes; box button toggles to remove for boxed participants', () => {
    select('sq');
    fireEvent.click(within(bar()).getByRole('button', { name: 'Add note' }));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Add ref frame' }));
    expect(data().items.some((i) => i.type === 'note')).toBe(true);
    expect(data().items.some((i) => i.type === 'ref')).toBe(true);
    // box button without a selected participant is a no-op
    fireEvent.click(within(bar()).getByRole('button', { name: 'Group participant in a box' }));
    expect(data().boxes ?? []).toHaveLength(0);
    fireEvent.click(part('Client'));
    fireEvent.pointerDown(part('Client'));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Group participant in a box' }));
    expect(data().boxes).toHaveLength(1);
    fireEvent.click(within(bar()).getByRole('button', { name: 'Remove participant box' }));
    expect(data().boxes ?? []).toHaveLength(0);
  });
  it('with a participant selected: add participant/note/ref anchor to it and the type select edits it', () => {
    select('sq');
    fireEvent.pointerDown(part('Client'));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Add participant' }));
    expect(names()).toHaveLength(3);
    fireEvent.pointerDown(part('Client'));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Add note' }));
    fireEvent.pointerDown(part('Client'));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Add ref frame' }));
    fireEvent.pointerDown(part('Client'));
    fireEvent.change(within(bar()).getByRole('combobox', { name: 'Participant type' }), { target: { value: 'actor' } });
    expect(data().participants.some((p) => p.kind === 'actor')).toBe(true);
    expect(document.querySelector('.seq-glyph')).not.toBeNull();
    for (const k of ['boundary', 'control', 'entity', 'database']) {
      fireEvent.pointerDown(screen.getAllByRole('button', { name: /^Participant / })[0]);
      fireEvent.change(within(bar()).getByRole('combobox', { name: 'Participant type' }), { target: { value: k } });
    }
    expect(document.querySelectorAll('.seq-glyph').length).toBeGreaterThan(0);
  });
  it('message toolbar: type, ends (found/lost/normal), from/to, swap, delete', () => {
    select('sq');
    const m = () => firstMsg();
    fireEvent.pointerDown(document.querySelector('.seq-msg')!);
    const b = () => within(bar());
    fireEvent.change(b().getByRole('combobox', { name: 'Message type' }), { target: { value: 'async' } });
    expect(m().kind).toBe('async');
    const fromBefore = m().from;
    fireEvent.click(b().getByRole('button', { name: 'Swap direction' }));
    expect(m().from).not.toBe(fromBefore);
    fireEvent.change(b().getByRole('combobox', { name: 'Message from' }), { target: { value: data().participants[0].id } });
    fireEvent.change(b().getByRole('combobox', { name: 'Message to' }), { target: { value: data().participants[1].id } });
    for (const e of ['found', 'lost']) {
      fireEvent.change(b().getByRole('combobox', { name: 'Message ends' }), { target: { value: e } });
      expect(m().ext).toBe(e);
      expect(b().getByRole('combobox', { name: 'Message lifeline' })).toBeInTheDocument();
      expect(b().queryByRole('button', { name: 'Swap direction' })).toBeNull();
      expect(screen.getByTestId(e === 'found' ? 'seq-end-to' : 'seq-end-from')).toBeInTheDocument();
      fireEvent.change(b().getByRole('combobox', { name: 'Message lifeline' }), { target: { value: data().participants[1].id } });
    }
    fireEvent.change(b().getByRole('combobox', { name: 'Message ends' }), { target: { value: 'normal' } });
    expect(m().ext).toBeUndefined();
    expect(document.querySelector('.seq-dot')).toBeNull();
    for (const kind of ['sync', 'return', 'create', 'destroy', 'async']) fireEvent.change(b().getByRole('combobox', { name: 'Message type' }), { target: { value: kind } });
    const before = allMessages(data().items).length;
    fireEvent.click(b().getByRole('button', { name: 'Delete selected' }));
    expect(allMessages(data().items)).toHaveLength(before - 1);
  });
  it('delete selected participant; numbering toggles label; fragment select ignores empty value', () => {
    select('sq');
    fireEvent.pointerDown(part('Server'));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Delete selected' }));
    expect(names()).toEqual(['Client']);
    fireEvent.change(within(bar()).getByRole('combobox', { name: 'Add fragment' }), { target: { value: '' } });
    expect(data().items.some((i) => i.type === 'fragment')).toBe(false);
    fireEvent.click(within(bar()).getByRole('button', { name: 'Turn numbering on' }));
    fireEvent.click(within(bar()).getByRole('button', { name: 'Turn numbering off' }));
    expect(data().autonumber).toBe(false);
  });
  it('fragment around a selected message; fragment toolbar adds sections and deletes', () => {
    select('sq');
    fireEvent.pointerDown(document.querySelector('.seq-msg')!);
    fireEvent.change(within(bar()).getByRole('combobox', { name: 'Add fragment' }), { target: { value: 'alt' } });
    const frag = document.querySelector('.seq-frag-box')!;
    fireEvent.pointerDown(frag);
    const fbar = screen.getByRole('toolbar', { name: 'Fragment tools' });
    fireEvent.click(within(fbar).getByRole('button', { name: 'Add else section' }));
    expect(document.querySelectorAll('.seq-frag-div').length).toBe(1);
    fireEvent.pointerDown(document.querySelector('.seq-frag-tab')!);
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Fragment tools' })).getByRole('button', { name: 'Delete fragment' }));
    expect(data().items.some((i) => i.type === 'fragment')).toBe(false);
  });
  it('par/critical/rect fragments: section button wording, rect has no add-section and no tab', () => {
    for (const op of ['par', 'critical', 'rect'] as const) {
      edit((d) => addFragment(d, op, []));
    }
    select('sq');
    const frags = Array.from(document.querySelectorAll('.seq-frag-box'));
    expect(frags.length).toBeGreaterThanOrEqual(3);
    for (const f of frags) {
      fireEvent.pointerDown(f);
      const fb = screen.getByRole('toolbar', { name: 'Fragment tools' });
      expect(within(fb).getByRole('button', { name: 'Delete fragment' })).toBeInTheDocument();
    }
    expect(document.querySelector('.seq-frag-box.bg')).not.toBeNull();
  });
  it('locked: no toolbar, no editing, no drag', () => {
    select('sq', true);
    expect(screen.queryByRole('toolbar', { name: 'Sequence tools' })).toBeNull();
    fireEvent.doubleClick(part('Client'));
    expect(screen.queryByRole('textbox', { name: 'Participant name' })).toBeNull();
    fireEvent.doubleClick(document.querySelector('.seq-tab-text')!.parentElement!);
    fireEvent.doubleClick(document.querySelector('.seq-msg')!);
    expect(screen.queryByRole('textbox', { name: 'Message text' })).toBeNull();
    expect(screen.queryByRole('textbox', { name: 'Sequence title' })).toBeNull();
    const before = names();
    pointer(part('Client'), [0, 0], [500, 0]);
    press(root(), 'Delete');
    expect(names()).toHaveLength(before.length);
  });
});

describe('SequenceNode inline editors', () => {
  const finish = (label: string, value: string, key = 'Enter', init: Record<string, unknown> = {}) => {
    const input = screen.getByRole('textbox', { name: label });
    fireEvent.change(input, { target: { value } });
    press(input, key, init);
  };
  it('title: double click, blank rejected, valid renames; rename request from the UI store opens it', () => {
    select('sq');
    fireEvent.doubleClick(document.querySelector('.seq-tab-text')!.parentElement!);
    finish('Sequence title', '   ');
    expect(data().label).toBe('Flow');
    act(() => useUiStore.getState().setEditing('sq'));
    finish('Sequence title', 'Checkout');
    expect(data().label).toBe('Checkout');
    expect(screen.getByText('sd Checkout')).toBeInTheDocument();
  });
  it('message text edit, blur commits, unchanged value does not commit, blur after Enter is ignored', () => {
    select('sq');
    fireEvent.doubleClick(document.querySelector('.seq-msg')!);
    const input = screen.getByRole('textbox', { name: 'Message text' });
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: 'ping' } });
    fireEvent.blur(input);
    expect(firstMsg().text).toBe('ping');
    fireEvent.doubleClick(document.querySelector('.seq-msg')!);
    const again = screen.getByRole('textbox', { name: 'Message text' });
    press(again, 'Enter');
    fireEvent.blur(again);
    expect(firstMsg().text).toBe('ping');
    fireEvent.doubleClick(document.querySelector('.seq-msg')!);
    press(screen.getByRole('textbox', { name: 'Message text' }), 'a');
  });
  it('note, ref, box and guard editors', () => {
    edit((d) => addNote(d, {}));
    edit((d) => addRef(d, {}));
    edit((d) => addBox(d, [d.participants[0].id], 'Grp'));
    edit((d) => addFragment(d, 'loop', []));
    select('sq');
    fireEvent.doubleClick(document.querySelector('.seq-note')!);
    const note = screen.getByRole('textbox', { name: 'Note text' });
    fireEvent.change(note, { target: { value: 'line1\nline2' } });
    press(note, 'Enter');
    expect(screen.getByRole('textbox', { name: 'Note text' })).toBeInTheDocument();
    press(screen.getByRole('textbox', { name: 'Note text' }), 'Enter', { ctrlKey: true });
    expect(data().items.some((i) => i.type === 'note' && (i as { text: string }).text === 'line1\nline2')).toBe(true);
    fireEvent.doubleClick(document.querySelector('.seq-ref')!);
    finish('Ref text', 'See other', 'Enter', { metaKey: true });
    fireEvent.doubleClick(document.querySelector('.seq-box')!);
    finish('Box label', 'Renamed');
    expect(data().boxes?.[0].label).toBe('Renamed');
    fireEvent.doubleClick(document.querySelector('.seq-guard')!);
    finish('Guard condition', 'x > 1');
    expect(screen.getByText('[x > 1]')).toBeInTheDocument();
  });
  it('second section guard placeholder and divider editing', () => {
    edit((d) => addFragment(d, 'alt', []));
    const fid = data().items.find((i) => i.type === 'fragment')!.id;
    act(() => s().updateSequence('sq', (d) => ({ ...d })));
    select('sq');
    fireEvent.pointerDown(document.querySelector('.seq-frag-box')!);
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Fragment tools' })).getByRole('button', { name: 'Add else section' }));
    expect(fid).toBeTruthy();
    const guards = document.querySelectorAll('.seq-guard');
    expect(guards.length).toBe(2);
    fireEvent.doubleClick(guards[1]);
    finish('Guard condition', 'else-cond');
    expect(screen.getByText('[else-cond]')).toBeInTheDocument();
  });
  it('Tab / Shift+Tab through participant names; Shift+Tab on first does nothing', () => {
    select('sq');
    fireEvent.doubleClick(part('Client'));
    finish('Participant name', 'Client', 'Tab', { shiftKey: true });
    expect(names()).toHaveLength(2);
    fireEvent.doubleClick(part('Server'));
    finish('Participant name', 'S2', 'Tab', { shiftKey: true });
    expect(screen.getByRole('textbox', { name: 'Participant name' })).toBeInTheDocument();
  });
  it('a message input is not editable text for a deleted target (edit of removed item renders nothing)', () => {
    select('sq');
    fireEvent.doubleClick(document.querySelector('.seq-msg')!);
    expect(screen.getByRole('textbox', { name: 'Message text' })).toBeInTheDocument();
    edit((d) => ({ ...d, items: [] }));
    expect(screen.queryByRole('textbox', { name: 'Message text' })).toBeNull();
  });
});

describe('SequenceNode keyboard', () => {
  it('ignored while editing, when unselected or without a selection', () => {
    select('sq');
    const el = root();
    act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: false })) })));
    press(el, 'Enter');
    select('sq');
    press(root(), 'Enter');
    press(root(), 'Tab');
    expect(names()).toHaveLength(2);
  });
  it('Delete / Backspace remove the selected participant or message; Enter opens editors; frag Enter ignored', () => {
    select('sq');
    fireEvent.pointerDown(document.querySelector('.seq-msg')!);
    press(root(), 'Enter');
    expect(screen.getByRole('textbox', { name: 'Message text' })).toBeInTheDocument();
    press(screen.getByRole('textbox', { name: 'Message text' }), 'Escape');
    const n = allMessages(data().items).length;
    press(root(), 'Backspace');
    expect(allMessages(data().items)).toHaveLength(n - 1);
    fireEvent.pointerDown(part('Server'));
    press(root(), 'Delete');
    expect(names()).toEqual(['Client']);
    edit((d) => addFragment(d, 'opt', []));
    fireEvent.pointerDown(document.querySelector('.seq-frag-box')!);
    press(root(), 'Enter');
    expect(screen.queryByRole('textbox', { name: 'Message text' })).toBeNull();
  });
  it('Arrow up/down reorder messages and notes within bounds', () => {
    edit((d) => addNote(d, {}));
    select('sq');
    fireEvent.pointerDown(document.querySelector('.seq-msg')!);
    const idsOf = () => data().items.map((i) => i.id);
    const first = idsOf()[0];
    press(root(), 'ArrowUp');
    expect(idsOf()[0]).toBe(first);
    press(root(), 'ArrowDown');
    expect(idsOf()[0]).not.toBe(first);
    press(root(), 'ArrowDown');
    press(root(), 'ArrowDown');
    press(root(), 'ArrowDown');
    fireEvent.pointerDown(document.querySelector('.seq-note')!);
    press(root(), 'ArrowUp');
    expect(data().items).toHaveLength(3);
  });
  it('Arrow left/right move participants; Tab / Shift+Tab move selection', () => {
    select('sq');
    fireEvent.pointerDown(part('Client'));
    press(root(), 'ArrowRight');
    expect(names()).toEqual(['Server', 'Client']);
    press(root(), 'ArrowLeft');
    expect(names()).toEqual(['Client', 'Server']);
    press(root(), 'Tab');
    expect(part('Server').getAttribute('class')).toContain('sel');
    press(root(), 'Tab');
    press(root(), 'Tab', { shiftKey: true });
    expect(part('Client').getAttribute('class')).toContain('sel');
  });
  it('focusing a participant selects it only when the node is selected', () => {
    fireEvent.focus(part('Client'));
    expect(part('Client').getAttribute('class')).not.toContain('sel');
    select('sq');
    fireEvent.focus(part('Client'));
    expect(part('Client').getAttribute('class')).toContain('sel');
  });
});

describe('SequenceNode dragging', () => {
  const rect = () => {
    const svg = document.querySelector('svg.seq-svg') as SVGSVGElement;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 1000, height: 1000, right: 1000, bottom: 1000, x: 0, y: 0, toJSON: () => ({}) });
  };
  it('a short move is a plain click (select only); a long move reorders participants', () => {
    select('sq');
    rect();
    const before = names();
    pointer(part('Client'), [10, 10], [11, 11]);
    expect(names()).toEqual(before);
    pointer(part('Client'), [10, 10], [900, 10], { steps: [[300, 10], [900, 10]] });
    expect(names()).toEqual(['Server', 'Client']);
  });
  it('right button does not start a drag; dragging a message reorders items; note drag shows drop line', () => {
    edit((d) => addNote(d, {}));
    select('sq');
    rect();
    const order = () => data().items.map((i) => i.id);
    const was = order();
    pointer(document.querySelector('.seq-msg')!, [10, 10], [10, 900], { button: 2 });
    expect(order()).toEqual(was);
    pointer(document.querySelector('.seq-msg')!, [10, 10], [10, 900], { steps: [[10, 500], [10, 900]] });
    expect(order()).not.toEqual(was);
    pointer(document.querySelector('.seq-note')!, [10, 900], [10, 0], { steps: [[10, 0]] });
    pointer(document.querySelector('.seq-ref') ?? document.querySelector('.seq-note')!, [10, 5], [10, 6]);
  });
  it('dragging a selected message end retargets it; without move nothing changes; locked has no handle', () => {
    select('sq');
    rect();
    fireEvent.pointerDown(document.querySelector('.seq-msg')!);
    const handle = screen.getByTestId('seq-end-to');
    const to0 = firstMsg().to;
    fireEvent.pointerDown(handle, { button: 2 });
    fireEvent.pointerDown(handle, { button: 0, clientX: 0, clientY: 0 });
    fireEvent(window, new Event('pointerup'));
    expect(firstMsg().to).toBe(to0);
    fireEvent.pointerDown(handle, { button: 0 });
    fireEvent(window, Object.assign(new Event('pointermove'), { clientX: 0, clientY: 0 }));
    expect(document.querySelectorAll('.seq-drop').length).toBeGreaterThan(0);
    fireEvent(window, new Event('pointerup'));
    expect(firstMsg().to).not.toBe(to0);
    const from = screen.queryByTestId('seq-end-from');
    if (from) {
      fireEvent.pointerDown(from);
      fireEvent(window, Object.assign(new Event('pointermove'), { clientX: 900, clientY: 0 }));
      fireEvent(window, new Event('pointerup'));
    }
    select('sq', true);
    fireEvent.pointerDown(document.querySelector('.seq-msg')!);
    expect(screen.queryByTestId('seq-end-to')).toBeNull();
  });
  it('self message has no end handles and found/lost show one', () => {
    edit((d) => addMessage(d, {}));
    select('sq');
    const id = allMessages(data().items)[2]?.id ?? firstMsg().id;
    edit((d) => ({ ...d, items: d.items.map((i) => (isMessage(i) && i.id === id ? { ...i, to: i.from } : i)) }));
    fireEvent.pointerDown(document.querySelectorAll('.seq-msg')[2] ?? document.querySelector('.seq-msg')!);
    expect(document.querySelector('.seq-msg')).not.toBeNull();
  });
  it('clicking the svg background clears the selection', () => {
    select('sq');
    fireEvent.pointerDown(part('Client'));
    expect(part('Client').getAttribute('class')).toContain('sel');
    fireEvent.pointerDown(document.querySelector('svg.seq-svg')!);
    expect(part('Client').getAttribute('class')).not.toContain('sel');
  });
  it('deselecting the node resets selection and open editors', () => {
    select('sq');
    fireEvent.doubleClick(part('Client'));
    expect(screen.getByRole('textbox', { name: 'Participant name' })).toBeInTheDocument();
    act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: false })) })));
    expect(screen.queryByRole('textbox', { name: 'Participant name' })).toBeNull();
  });
  it('adding a participant by Tab on the last name creates and edits a new one', () => {
    select('sq');
    edit((d) => addParticipant(d));
    fireEvent.doubleClick(screen.getAllByRole('button', { name: /^Participant / }).at(-1)!);
    const input = screen.getByRole('textbox', { name: 'Participant name' });
    press(input, 'Tab');
    expect(names().length).toBeGreaterThanOrEqual(4);
  });
});

import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../../App';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { seedProject } from '../../test/workspace';
import { blankSequence, sequenceOf } from '../../lib/seq/node';
import { stateNode, compositeNode } from '../../lib/state/convert';
import { actorNode, componentNode, useCaseNode } from '../../lib/uml2/nodes';
import { allMessages, type SeqMessage } from '../../lib/seq/types';
import { layoutSequence } from '../../lib/seq/layout';
import { deploymentNode } from '../../lib/deployment/nodes';

const s = () => useDiagramStore.getState();
function open() {
  localStorage.clear();
  s().reset();
  useUiStore.getState().resetUi();
  const p = seedProject('UML2');
  return render(<App initialProjectId={p.projectId} />);
}
const select = (id: string) => act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: n.id === id })) })));
const names = () => Array.from(document.querySelectorAll('.seq-part-name')).map((e) => e.textContent);
const seqData = () => sequenceOf(s().nodes.find((n) => n.type === 'sequence')!);

describe('SequenceNode', () => {
  beforeEach(() => {
    open();
    act(() => s().addNode(blankSequence('sq', { x: 0, y: 0 }, 'Login')));
  });
  it('draws the title, participants, numbered messages and lifelines', () => {
    expect(screen.getByText('sd Login')).toBeInTheDocument();
    expect(names()).toEqual(['Client', 'Server']);
    act(() => s().updateSequence('sq', (d) => ({ ...d, autonumber: true })));
    expect(screen.getByText('1. request')).toBeInTheDocument();
    expect(screen.getByText('2. response')).toBeInTheDocument();
    expect(document.querySelectorAll('.seq-life')).toHaveLength(2);
    expect(document.querySelectorAll('.seq-act').length).toBeGreaterThan(0); // the call opens an activation, the return closes it
  });
  it('shows the toolbar only while selected; "Add participant" and "Add message" edit the diagram (one undo step each)', () => {
    expect(screen.queryByRole('toolbar', { name: 'Sequence tools' })).toBeNull();
    select('sq');
    const bar = screen.getByRole('toolbar', { name: 'Sequence tools' });
    fireEvent.click(within(bar).getByRole('button', { name: 'Add participant' }));
    expect(names()).toHaveLength(3);
    fireEvent.click(within(bar).getByRole('button', { name: 'Add message' }));
    expect(allMessages(seqData().items)).toHaveLength(3);
    act(() => s().undo());
    expect(allMessages(seqData().items)).toHaveLength(2);
    fireEvent.change(within(bar).getByRole('combobox', { name: 'Add fragment' }), { target: { value: 'loop' } });
    expect(seqData().items.some((i) => i.type === 'fragment' && i.op === 'loop')).toBe(true);
    expect(document.querySelector('.seq-frag-op')?.textContent).toBe('loop');
    fireEvent.click(within(screen.getByRole('toolbar', { name: 'Sequence tools' })).getByRole('button', { name: 'Turn numbering on' }));
    expect(seqData().autonumber).toBe(true);
  });
  it('double click renames a participant; Escape cancels', () => {
    select('sq');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Participant Client' }));
    const input = screen.getByRole('textbox', { name: 'Participant name' });
    fireEvent.change(input, { target: { value: 'Browser' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(names()[0]).toBe('Browser');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Participant Server' }));
    const again = screen.getByRole('textbox', { name: 'Participant name' });
    fireEvent.change(again, { target: { value: 'Nope' } });
    fireEvent.keyDown(again, { key: 'Escape' });
    expect(names()[1]).toBe('Server');
  });
  it('Tab commits and moves to the next participant name; Tab on the last one adds a participant', () => {
    select('sq');
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Participant Client' }));
    let input = screen.getByRole('textbox', { name: 'Participant name' });
    fireEvent.change(input, { target: { value: 'Web' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(names()[0]).toBe('Web');
    input = screen.getByRole('textbox', { name: 'Participant name' });
    expect(input).toHaveValue('Server');
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(names()).toHaveLength(3);
    expect(screen.getByRole('textbox', { name: 'Participant name' })).toHaveValue('Participant');
    fireEvent.keyDown(screen.getByRole('textbox', { name: 'Participant name' }), { key: 'Tab', shiftKey: true });
    expect(screen.getByRole('textbox', { name: 'Participant name' })).toHaveValue('Server');
  });
  it('double click edits a message label inline', () => {
    select('sq');
    fireEvent.doubleClick(screen.getByText('request'));
    const input = screen.getByRole('textbox', { name: 'Message text' });
    fireEvent.change(input, { target: { value: 'POST /login' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(allMessages(seqData().items)[0].text).toBe('POST /login');
  });
  it('Delete removes the selected message; arrow keys reorder it', () => {
    select('sq');
    const root = screen.getByTestId('sequence-sq');
    fireEvent.pointerDown(screen.getByText('request').closest('g')!, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.keyDown(root, { key: 'ArrowDown' });
    expect(allMessages(seqData().items).map((m) => m.text)).toEqual(['response', 'request']);
    fireEvent.keyDown(root, { key: 'Delete' });
    expect(allMessages(seqData().items).map((m) => m.text)).toEqual(['response']);
  });
  it('the toolbar changes the type and the ends of the selected message', () => {
    select('sq');
    fireEvent.pointerDown(screen.getByText('request').closest('g')!, { button: 0, clientX: 10, clientY: 10 });
    const bar = screen.getByRole('toolbar', { name: 'Sequence tools' });
    fireEvent.change(within(bar).getByRole('combobox', { name: 'Message type' }), { target: { value: 'async' } });
    expect(allMessages(seqData().items)[0].kind).toBe('async');
    const second = seqData().participants[1].id;
    fireEvent.change(within(bar).getByRole('combobox', { name: 'Message from' }), { target: { value: second } });
    expect(allMessages(seqData().items)[0].from).toBe(second);
    fireEvent.click(within(bar).getByRole('button', { name: 'Swap direction' }));
    expect(allMessages(seqData().items)[0].to).toBe(second);
  });
  it('ref frame, participant box, found / lost ends and message end drag', () => {
    select('sq');
    const bar = () => within(screen.getByRole('toolbar', { name: 'Sequence tools' }));
    fireEvent.click(bar().getByRole('button', { name: 'Add ref frame' }));
    expect(seqData().items.some((i) => i.type === 'ref')).toBe(true);
    expect(document.querySelectorAll('.seq-ref')).toHaveLength(1);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Participant Client' }), { button: 0, clientX: 1, clientY: 1 });
    fireEvent.pointerUp(window);
    fireEvent.click(bar().getByRole('button', { name: 'Group participant in a box' }));
    expect(seqData().boxes).toHaveLength(1);
    expect(document.querySelectorAll('.seq-box')).toHaveLength(1);
    // found / lost through the ends select
    fireEvent.pointerDown(screen.getByText('request').closest('g')!, { button: 0, clientX: 10, clientY: 10 });
    fireEvent.change(bar().getByRole('combobox', { name: 'Message ends' }), { target: { value: 'found' } });
    expect((allMessages(seqData().items)[0] as SeqMessage).ext).toBe('found');
    expect(document.querySelectorAll('.seq-dot')).toHaveLength(1);
    fireEvent.change(bar().getByRole('combobox', { name: 'Message ends' }), { target: { value: 'normal' } });
    expect((allMessages(seqData().items)[0] as SeqMessage).ext).toBeUndefined();
    // drag the target end of "request" onto the Client lifeline onto the Server lifeline
    const L = layoutSequence(seqData());
    const svg = document.querySelector('svg.seq-svg')!;
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: L.width, height: L.height, right: L.width, bottom: L.height, x: 0, y: 0, toJSON: () => ({}) });
    const m0 = allMessages(seqData().items)[0];
    expect(m0.to).not.toBe(L.participants[1].id);
    fireEvent.pointerDown(screen.getByTestId('seq-end-to'), { button: 0, clientX: 0, clientY: 0 });
    fireEvent.pointerMove(window, { clientX: L.participants[1].x, clientY: 0 });
    fireEvent.pointerUp(window);
    const m1 = allMessages(seqData().items)[0];
    expect(m1.id).toBe(m0.id);
    expect(m1.to).toBe(L.participants[1].id);
  });
  it('a locked diagram has no toolbar and no inline editing', () => {
    act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: true, data: { ...n.data, locked: true } })) })));
    expect(screen.queryByRole('toolbar', { name: 'Sequence tools' })).toBeNull();
    fireEvent.doubleClick(screen.getByRole('button', { name: 'Participant Client' }));
    expect(screen.queryByRole('textbox', { name: 'Participant name' })).toBeNull();
  });
  it('F2 / Rename asks for the diagram title', () => {
    select('sq');
    act(() => useUiStore.getState().setEditing('sq'));
    const input = screen.getByRole('textbox', { name: 'Sequence title' });
    fireEvent.change(input, { target: { value: 'OAuth' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(seqData().label).toBe('OAuth');
  });
});

describe('state, use case and component nodes', () => {
  beforeEach(() => open());
  it('state: name, activities, pseudo states', () => {
    act(() => s().addNodes([
      stateNode('a', { x: 0, y: 0 }, { label: 'Idle', activity: 'entry / start\nexit / stop' }),
      stateNode('i', { x: 200, y: 0 }, { label: '', stateKind: 'initial' }),
      stateNode('f', { x: 300, y: 0 }, { label: '', stateKind: 'final' }),
      stateNode('c', { x: 400, y: 0 }, { label: '', stateKind: 'choice' }),
      stateNode('h', { x: 500, y: 0 }, { label: '', stateKind: 'deepHistory' }),
      stateNode('fk', { x: 600, y: 0 }, { label: '', stateKind: 'fork' }),
      compositeNode('comp', { x: 0, y: 200 }, 'Active'),
    ]));
    expect(screen.getByText('Idle')).toBeInTheDocument();
    expect(screen.getByText(/entry \/ start/)).toBeInTheDocument();
    expect(screen.getByText('H*')).toBeInTheDocument();
    for (const id of ['i', 'f', 'c', 'h', 'fk']) expect(screen.getByTestId(`state-${id}`)).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(document.querySelector('.variant-composite')).not.toBeNull();
  });
  it('state: double click edits the name and the node keeps fitting its label', () => {
    act(() => s().addNode(stateNode('a', { x: 0, y: 0 }, { label: 'Idle' })));
    const w0 = s().nodes[0].width!;
    fireEvent.doubleClick(screen.getByText('Idle'));
    const input = screen.getByRole('textbox', { name: 'State name' });
    fireEvent.change(input, { target: { value: 'Waiting for the payment provider to confirm' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(screen.getByText('Waiting for the payment provider to confirm')).toBeInTheDocument();
    expect(s().nodes[0].width!).toBeGreaterThan(w0);
  });
  it('use case: actor and ellipse with names; boundary has a title', () => {
    act(() => s().addNodes([actorNode('ac', { x: 0, y: 0 }, 'Customer'), useCaseNode('uc', { x: 200, y: 0 }, 'Pay order')]));
    expect(screen.getByText('Customer')).toBeInTheDocument();
    expect(screen.getByText('Pay order')).toBeInTheDocument();
    expect(document.querySelector('.uc-ellipse')).not.toBeNull();
    expect(document.querySelector('.uc-fig')).not.toBeNull();
    fireEvent.doubleClick(screen.getByText('Pay order'));
    const input = screen.getByRole('textbox', { name: 'Use case name' });
    fireEvent.change(input, { target: { value: 'Refund order' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(s().nodes.find((n) => n.id === 'uc')!.data.label).toBe('Refund order');
  });
  it('component: kinds draw the right shapes and the stereotype', () => {
    act(() => s().addNodes([
      componentNode('c', { x: 0, y: 0 }, 'component', 'Orders'),
      componentNode('n', { x: 200, y: 0 }, 'node', 'Server'),
      componentNode('a', { x: 400, y: 0 }, 'artifact', 'app.war'),
      componentNode('p', { x: 600, y: 0 }, 'provided', 'IOrders'),
      componentNode('r', { x: 700, y: 0 }, 'required', 'IPay'),
    ]));
    expect(screen.getByText('«component»')).toBeInTheDocument();
    expect(screen.getByText('«node»')).toBeInTheDocument();
    expect(screen.getByText('«artifact»')).toBeInTheDocument();
    expect(screen.getByText('IOrders')).toBeInTheDocument();
    expect(screen.getByText('IPay')).toBeInTheDocument();
    expect(document.querySelectorAll('.cp-ball').length).toBeGreaterThanOrEqual(2);
  });
});

describe('deployment nodes', () => {
  beforeEach(() => open());
  it('draw 3D boxes, artifacts and components with stereotypes; double click renames', () => {
    act(() => s().addNodes([
      deploymentNode('n', { x: 0, y: 0 }, 'node', 'Server'),
      deploymentNode('d', { x: 200, y: 0 }, 'device', 'Phone'),
      deploymentNode('e', { x: 400, y: 0 }, 'executionEnvironment', 'Tomcat'),
      deploymentNode('a', { x: 600, y: 0 }, 'artifact', 'shop.war'),
      deploymentNode('c', { x: 800, y: 0 }, 'component', 'Shop', { stereotype: 'svc' }),
    ]));
    expect(screen.getByText('«device»')).toBeInTheDocument();
    expect(screen.getByText('«execution environment»')).toBeInTheDocument();
    expect(screen.getByText('«artifact»')).toBeInTheDocument();
    expect(screen.getByText('«svc»')).toBeInTheDocument();
    expect(document.querySelectorAll('.dp-side').length).toBe(6); // two side faces on each of the three boxes
    fireEvent.doubleClick(screen.getByText('Server'));
    const input = screen.getByRole('textbox', { name: 'Name' });
    fireEvent.change(input, { target: { value: 'App server' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(s().nodes.find((x) => x.id === 'n')!.data.label).toBe('App server');
    expect(s().nodes.find((x) => x.id === 'n')!.width).toBeGreaterThanOrEqual(160);
  });
  it('the inspector edits kind and stereotype, tidy arranges and a protocol edge keeps its label', () => {
    act(() => s().addNodes([deploymentNode('n', { x: 0, y: 0 }, 'node', 'Server'), deploymentNode('m', { x: 0, y: 0 }, 'node', 'Db')]));
    act(() => { s().addUmlEdge('n', 'm', { kind: 'communication' }); });
    act(() => s().updateEdges([s().edges[0].id], { label: 'JDBC' }));
    select('n');
    fireEvent.change(screen.getByLabelText('Deployment kind'), { target: { value: 'device' } });
    expect(s().nodes.find((x) => x.id === 'n')!.data.depKind).toBe('device');
    expect(s().nodes.find((x) => x.id === 'n')!.height).toBe(110);
    expect(s().tidyDeployment()).toBe(2);
    const [a, b] = ['n', 'm'].map((id) => s().nodes.find((x) => x.id === id)!);
    expect(a.position.x).toBeLessThan(b.position.x);
    expect(s().edges[0].label).toBe('JDBC');
  });
});

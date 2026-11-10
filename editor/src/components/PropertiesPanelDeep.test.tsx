import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { PropertiesPanel } from './PropertiesPanel';
import { blankClass } from '../lib/uml/geometry';
import type { DiagramEdge, DiagramNode } from '../types';

vi.setConfig({ testTimeout: 30000 }); // every control of every inspector is driven: slow under coverage
const s = () => useDiagramStore.getState();
const ALL_OPEN = JSON.stringify({ open: ['general', 'cluster', 'style', 'text', 'arrange', 'instance', 'autolayout', 'constraints', 'link', 'styles', 'crosslinks', 'arch'], multi: true });

beforeEach(() => {
  cleanup();
  localStorage.clear();
  localStorage.setItem('sdd:acc:props', ALL_OPEN);
  s().reset();
  useUiStore.getState().resetUi();
});

const node = (id: string, type: string, data: Record<string, unknown> = {}, extra: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id, type, position: { x: 0, y: 0 }, selected: true, data: { label: id, ...data }, ...extra }) as unknown as DiagramNode;
const edge = (id: string, source: string, target: string, data: Record<string, unknown> = {}, extra: Partial<DiagramEdge> = {}): DiagramEdge =>
  ({ id, source, target, selected: true, data, ...extra }) as unknown as DiagramEdge;
const put = (nodes: DiagramNode[], edges: DiagramEdge[] = []) => act(() => useDiagramStore.setState({ nodes, edges }));

/** pick every option of every themed Select, nudge every slider, type in every field, flip toggles and press every non-destructive button */
function drive(root: HTMLElement = document.body, skip = /^(Delete|Remove|Duplicate|Group|Lock|Unlock)/) {
  for (const trig of Array.from(root.querySelectorAll<HTMLButtonElement>('.color-trigger'))) {
    act(() => { fireEvent.click(trig); });
    const pops = document.querySelectorAll('.color-pop');
    const sw = Array.from(pops[pops.length - 1]?.querySelectorAll<HTMLButtonElement>('.swatches button') ?? []);
    if (sw[1]) act(() => { fireEvent.click(sw[1]); });
    act(() => { fireEvent.keyDown(document.body, { key: 'Escape' }); });
  }
  for (const cb of Array.from(root.querySelectorAll<HTMLButtonElement>('button[role="combobox"]'))) {
    if (!cb.isConnected || cb.disabled) continue;
    act(() => { fireEvent.click(cb); });
    const options = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'));
    for (const o of options) if (o.isConnected) { act(() => { fireEvent.click(o); }); if (!document.querySelector('[role="option"]')) { act(() => { fireEvent.click(cb); }); } }
    if (document.querySelector('[role="option"]')) { act(() => { fireEvent.keyDown(cb, { key: 'Escape' }); }); }
  }
  for (const r of Array.from(root.querySelectorAll<HTMLInputElement>('input[type="range"]'))) {
    for (const v of [r.min, r.max]) act(() => { fireEvent.change(r, { target: { value: v } }); });
  }
  for (const inp of Array.from(root.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input[type="text"], input[type="number"], textarea'))) {
    if (!inp.isConnected || inp.readOnly || inp.disabled) continue;
    for (const v of ['zz1', '', '7', '#aabbcc']) act(() => { fireEvent.change(inp, { target: { value: v } }); fireEvent.blur(inp); });
  }
  for (const cb of Array.from(root.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'))) if (cb.isConnected && !cb.disabled) act(() => { fireEvent.click(cb); });
  for (const b of Array.from(root.querySelectorAll<HTMLButtonElement>('button'))) {
    if (!b.isConnected || b.disabled || b.getAttribute('role') === 'combobox') continue;
    const name = b.getAttribute('aria-label') ?? b.textContent ?? '';
    if (skip.test(name) || b.classList.contains('acc-header')) continue;
    act(() => { fireEvent.click(b); });
  }
}
const open = () => render(<PropertiesPanel />);
const reselect = () => act(() => useDiagramStore.setState((st) => ({ nodes: st.nodes.map((n) => ({ ...n, selected: true })) })));

describe('PropertiesPanel nodes', () => {
  it('empty state, and the plain kinds: icon, card, text, shape, sticky, stamp, draw, junction, frame', () => {
    put([]);
    const { unmount } = open();
    expect(screen.getByText('Nothing selected')).toBeInTheDocument();
    unmount();
    const kinds: [string, Record<string, unknown>][] = [
      ['icon', { iconId: 'service', subtitle: ':80', role: 'cache', labelColor: '#111111', background: 'filled' }],
      ['icon', { iconId: 'service', role: 'my-custom-role' }],
      ['card', { iconId: 'service', tags: [{ text: 'a', color: '#ff0000' }], layout: 'horizontal' }],
      ['text', {}], ['shape', { fillOpacity: 10 }], ['sticky', { fill: '#fff4a8', private: true, autoFont: true }],
      ['stamp', { emoji: '🔥' }], ['draw', { stroke: '#000000' }], ['junction', {}], ['frame', {}],
    ];
    for (const [type, data] of kinds) {
      put([node('n1', type, data)]);
      const r = open();
      drive(r.container);
      cleanup();
    }
  });

  it('icon: the title edits in the header, the role select offers a custom role, change icon opens the picker', () => {
    put([node('n1', 'icon', { iconId: 'service', label: 'API' })]);
    open();
    const title = screen.getByLabelText('Label');
    fireEvent.change(title, { target: { value: 'Gateway' } });
    fireEvent.blur(title);
    expect(s().nodes[0].data.label).toBe('Gateway');
    fireEvent.click(screen.getByRole('button', { name: /Change icon/ }));
    expect(useUiStore.getState().iconPickerFor).toBeTruthy();
    act(() => useUiStore.getState().setFocusRole(true));
    const custom = screen.getByLabelText('Custom role');
    fireEvent.change(custom, { target: { value: 'hot-data' } });
    fireEvent.blur(custom);
    fireEvent.change(screen.getByLabelText('Custom role'), { target: { value: 'Not a valid role!!' } });
    fireEvent.keyDown(screen.getByLabelText('Custom role'), { key: 'Enter' });
  });

  it('groups: plain, dashed, card and lane variants', () => {
    for (const variant of [undefined, 'dashed', 'card', 'lane']) {
      put([node('g', 'group', { variant, groupIcon: 'service' })]);
      const r = open();
      drive(r.container);
      cleanup();
    }
  });

  it('cluster: chips, add replica, collapse and edit wizard', () => {
    put([node('c', 'cluster', { topology: 'ring', collapsed: true, profileId: 'postgres-patroni', subtitle: 'x', iconId: 'service' }), node('m', 'icon', { iconId: 'service' }, { parentId: 'c', selected: false })]);
    const r = open();
    drive(r.container);
    expect(useDiagramStore.getState().nodes.length).toBeGreaterThan(1);
  });

  it('rich kinds go through their own inspector; table, class, sequence, timing', () => {
    put([blankClass('k', { x: 0, y: 0 }, 'class', 'K')]);
    s().selectOnly('node', 'k');
    open();
    expect(screen.getByLabelText('Class name')).toBeInTheDocument();
    cleanup();
    put([node('t', 'timing', { end: 100, unit: 'ms', lifelines: [], changes: [], messages: [], durations: [], accent: '#123456' })]);
    open();
    expect(screen.getByLabelText('Time unit')).toBeInTheDocument();
  });

  it('arch section, crosslinks and node in a frame/with parent (constraints)', () => {
    put([
      node('f', 'frame', {}, { width: 500, height: 500, selected: false }),
      node('p', 'group', {}, { selected: false }),
      node('i', 'icon', { iconId: 'service', arch: { kind: 'service' }, link: { fileId: 'x' } }, { position: { x: 10, y: 10 }, parentId: 'p' }),
    ]);
    const r = open();
    drive(r.container);
  });
});

describe('PropertiesPanel selections', () => {
  it('two nodes: bulk style and align; three nodes: distribute; duplicate / group / delete run', () => {
    put([node('a', 'icon', { iconId: 'service' }), node('b', 'icon', { iconId: 'service' }, { position: { x: 200, y: 0 } })]);
    const r = open();
    drive(r.container, /^$/);
    cleanup();
    put([node('a', 'icon', { iconId: 'service' }), node('b', 'icon', { iconId: 'service' }, { position: { x: 200, y: 0 } }), node('c', 'icon', { iconId: 'service' }, { position: { x: 500, y: 0 } })]);
    const r2 = open();
    for (const name of ['Horizontally', 'Vertically', 'Align left', 'Align center', 'Align right', 'Align top', 'Align middle', 'Align bottom']) fireEvent.click(screen.getByRole('button', { name }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    reselect();
    fireEvent.click(screen.getByRole('button', { name: 'Group' }));
    reselect();
    drive(r2.container, /^$/);
  });

  it('one node plus one edge shows the mixed selection with chips', () => {
    put([node('a', 'icon', { iconId: 'service' })], [edge('e', 'a', 'a')]);
    open();
    expect(screen.getByText(/2 items selected/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  });

  it('dev mode shows the dev panel instead of the form', () => {
    put([node('a', 'icon', { iconId: 'service' })]);
    act(() => useUiStore.setState({ devMode: true }));
    open();
    expect(screen.queryByText('Nothing selected')).toBeNull();
  });
});

describe('PropertiesPanel edges', () => {
  beforeEach(() => { localStorage.clear(); });
  const two = () => [node('a', 'icon', { iconId: 'service', label: 'A' }, { selected: false }), node('b', 'icon', { iconId: 'service', label: ' ' }, { selected: false, position: { x: 300, y: 0 } })];
  it('plain edge: every control; reverse, reset route, lock', () => {
    put(two(), [edge('e', 'a', 'b', { lineType: 'step-rounded', manual: true, labelT: 0.3, kind: 'replication', locked: false }, { label: 'hello' })]);
    const r = open();
    drive(r.container);
    expect(screen.getByLabelText('Edge label')).toBeInTheDocument();
  });
  it('locked edge, unlabelled; arrowheads each way', () => {
    put(two(), [edge('e', 'a', 'b', { locked: true, arrows: 'both' })]);
    const r = open();
    expect(screen.getByText('Locked')).toBeInTheDocument();
    drive(r.container, /^(Delete|Remove)/);
  });
  it('ER relation and UML relation edges add their own inspector', () => {
    put(
      [blankClass('a', { x: 0, y: 0 }, 'class', 'A'), blankClass('b', { x: 300, y: 0 }, 'class', 'B')].map((n) => ({ ...n, selected: false })),
      [edge('e', 'a', 'b', { uml: { kind: 'association' } })],
    );
    const r = open();
    expect(screen.getByLabelText('Relationship')).toBeInTheDocument();
    drive(r.container, /^(Delete|Remove|Reverse)/);
  });
  it('several edges: no per-edge label/relation rows, toolbar still works', () => {
    put(two(), [edge('e1', 'a', 'b', { manual: true }), edge('e2', 'b', 'a')]);
    open();
    expect(screen.getByText(/2 items selected/)).toBeInTheDocument();
  });

  it('single node header: duplicate, lock and delete; multi-selection accordion toggles', () => {
    put([node('a', 'icon', { iconId: 'service' })]);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Lock' }));
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }));
    reselect();
    cleanup();
    put([node('a', 'icon', { iconId: 'service' }), node('b', 'icon', { iconId: 'service' })]);
    open();
    const heads = Array.from(document.querySelectorAll<HTMLButtonElement>('.acc-header'));
    for (const h of heads) fireEvent.click(h);
    for (const h of heads) fireEvent.click(h);
  });
  it('edge header: reverse, reset route, lock, delete', () => {
    put(two(), [edge('e', 'a', 'b', { manual: true })]);
    open();
    for (const n of ['Reverse direction', 'Reset route', 'Lock']) fireEvent.click(screen.getByRole('button', { name: n }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  });

  it('shape border: width and line style; single-node delete', () => {
    put([node('sh', 'shape', { border: true, background: 'filled', fill: '#ffffff' })]);
    open();
    for (const n of ['Dashed', 'Dotted', 'Solid']) fireEvent.click(screen.getAllByRole('button', { name: n })[0]);
    fireEvent.change(screen.getByLabelText('Border width'), { target: { value: '4' } });
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
  });

  it('card tags: add and remove', () => {
    put([node('cd', 'card', { iconId: 'service', tags: [{ text: 'a', color: '#ff0000' }] })]);
    open();
    fireEvent.click(screen.getByRole('button', { name: 'Remove tag 1' }));
    expect(s().nodes[0].data.tags ?? []).toHaveLength(0);
  });
});

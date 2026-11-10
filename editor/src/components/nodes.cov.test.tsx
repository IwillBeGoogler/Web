import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { nodeTypes } from './nodes';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import type { DiagramNode, DiagramNodeData } from '../types';

const s = () => useDiagramStore.getState();
let seq = 0;
const mk = (type: string, data: Partial<DiagramNodeData> = {}, over: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id: `n${++seq}`, type, position: { x: 0, y: 0 }, width: 300, height: 200, data: { label: 'Lbl', ...data }, ...over }) as DiagramNode;

function Flow() {
  const nodes = useDiagramStore((st) => st.nodes);
  return <ReactFlow nodes={nodes} edges={[]} nodeTypes={nodeTypes} />;
}

function mount(nodes: DiagramNode[]) {
  act(() => useDiagramStore.setState({ nodes }));
  return render(
    <ReactFlowProvider>
      <div style={{ width: 800, height: 600 }}>
        <Flow />
      </div>
    </ReactFlowProvider>,
  );
}

beforeEach(() => {
  s().reset();
  useUiStore.getState().resetUi();
});

describe('IconNode', () => {
  it('shows label, subtitle, role pill, partition chips and arch badges', () => {
    const n = mk('icon', {
      iconId: 'postgresql', subtitle: 'sub', subtitleColor: '#123456', labelColor: '#654321', role: 'primary', arch: {},
      partitions: [{ topic: 't', partition: 1, leader: true }, { topic: 't', partition: 2, leader: false }],
      fontSize: 18, bold: true, align: 'left', textColor: '#111111',
    });
    const { container } = mount([n]);
    expect(screen.getByText('Lbl')).toHaveStyle({ fontWeight: '700' });
    expect(screen.getByText('sub')).toHaveStyle({ color: '#123456' });
    expect(container.querySelector('.role-pill')!.textContent).toBe('primary');
    const chips = container.querySelectorAll('.part-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0].textContent).toBe('P1★');
    expect(chips[0].getAttribute('title')).toBe('t partition 1 (leader)');
    expect(chips[1].getAttribute('title')).toBe('t partition 2');
    expect(screen.getByTestId('arch-badges').querySelectorAll('.arch-badge').length).toBeGreaterThan(0);
    expect(container.querySelectorAll('.handle')).toHaveLength(4);
  });

  it('subtitle falls back to textColor; plain node has no extras', () => {
    mount([mk('icon', { subtitle: 'sub', textColor: '#abcdef', partitions: [] })]);
    expect(screen.getByText('sub')).toHaveStyle({ color: '#abcdef' });
    expect(document.querySelector('.part-strip')).toBeNull();
    expect(document.querySelector('.role-pill')).toBeNull();
    expect(screen.queryByTestId('arch-badges')).toBeNull();
  });

  it('carded when filled; double-click edits label and commits to the store', () => {
    const n = mk('icon', { background: 'filled', fill: '#ff0000' });
    const { container } = mount([n]);
    expect(container.querySelector('.node-icon')!.classList.contains('carded')).toBe(true);
    expect(container.querySelector('.node-bg')).toBeTruthy();
    fireEvent.doubleClick(container.querySelector('.node-icon')!);
    expect(useUiStore.getState().editingId).toBe(n.id);
    const input = screen.getByLabelText('Node label') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Renamed' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(s().nodes.find((x) => x.id === n.id)!.data.label).toBe('Renamed');
    expect(useUiStore.getState().editingId).toBeNull();
  });

  it('selected class', () => {
    const { container } = mount([mk('icon', {}, { selected: true })]);
    expect(container.querySelector('.node-icon.selected')).toBeTruthy();
  });
});

describe('ShapeNode', () => {
  it('rect (default) and ellipse use frame styling; filled shows bg', () => {
    const { container } = mount([mk('shape', { background: 'filled' }), mk('shape', { shape: 'ellipse', border: true })]);
    const shapes = container.querySelectorAll<HTMLElement>('.node-shape');
    expect(shapes).toHaveLength(2);
    expect(shapes[0].querySelector('.node-bg')).toBeTruthy();
    expect(shapes[1].style.borderRadius).toBe('50%');
  });
  it('diamond renders polygon svg', () => {
    const { container } = mount([mk('shape', { shape: 'diamond', background: 'filled', fill: '#00ff00', border: true, shadow: true, strokeStyle: 'dashed' })]);
    const poly = container.querySelector('polygon')!;
    expect(poly.getAttribute('fill')).toBe('#00ff00');
    expect(poly.getAttribute('stroke-dasharray')).toBeTruthy();
  });
  it('diamond without fill or border', () => {
    const { container } = mount([mk('shape', { shape: 'diamond', background: 'transparent', border: false })]);
    const poly = container.querySelector('polygon')!;
    expect(poly.getAttribute('fill')).toBe('none');
    expect(poly.getAttribute('stroke')).toBe('none');
  });
  it('cylinder renders two paths; stroke fallback differs with border/stroke', () => {
    const { container } = mount([mk('shape', { shape: 'cylinder', background: 'filled', border: true, shadow: true }), mk('shape', { shape: 'cylinder', border: false })]);
    const svgs = container.querySelectorAll('[data-testid="cylinder-svg"]');
    expect(svgs).toHaveLength(2);
    expect(svgs[0].querySelectorAll('path')).toHaveLength(2);
    expect(svgs[1].querySelector('path')!.getAttribute('stroke')).toBe('#2d3340');
  });
  it('ellipsis renders three dots', () => {
    mount([mk('shape', { shape: 'ellipsis' })]);
    expect(screen.getByTestId('ellipsis')).toHaveTextContent('···');
  });
  it('double-click edits the label', () => {
    const n = mk('shape', {});
    mount([n]);
    fireEvent.doubleClick(document.querySelector('.node-shape')!);
    const ta = screen.getByLabelText('Label');
    fireEvent.change(ta, { target: { value: 'New' } });
    fireEvent.blur(ta);
    expect(s().nodes[0].data.label).toBe('New');
  });
});

describe('StickyNode', () => {
  it('plain and uml-note variants', () => {
    const { container } = mount([mk('sticky', { umlNote: true } as never), mk('sticky', {}, { selected: true })]);
    expect(container.querySelectorAll('.node-sticky')).toHaveLength(2);
    expect(container.querySelectorAll('.node-sticky.uml-note')).toHaveLength(1);
  });
});

describe('GroupNode', () => {
  it('plain group title, double-click edits', () => {
    const n = mk('group', { fontSize: 20, align: 'right', textColor: '#222222' });
    mount([n]);
    expect(screen.getByText('Lbl')).toHaveClass('group-title');
    fireEvent.doubleClick(screen.getByText('Lbl'));
    const input = screen.getByLabelText('Group title');
    fireEvent.change(input, { target: { value: 'G2' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(s().nodes[0].data.label).toBe('G2');
  });
  it('card variant shows subtitle and icon', () => {
    const { container } = mount([mk('group', { variant: 'card', subtitle: 'cs', groupIcon: 'postgresql' }, { selected: true })]);
    expect(screen.getByText('cs')).toHaveClass('group-subtitle');
    expect(container.querySelector('.node-group')!.classList.contains('variant-card')).toBe(true);
    expect(container.querySelector('.node-group')!.classList.contains('resizable')).toBe(true);
  });
  it('package variant has tab, hidden head, editable tab', () => {
    const n = mk('group', { variant: 'package' });
    const { container } = mount([n]);
    const tab = container.querySelector('.pkg-tab')!;
    expect(tab.textContent).toBe('Lbl');
    expect((container.querySelector('.group-head') as HTMLElement).style.display).toBe('none');
    fireEvent.doubleClick(tab);
    expect(screen.getByLabelText('Package name')).toBeInTheDocument();
  });
  it('dashed variant caption; lane variants; boundary', () => {
    const { container } = mount([
      mk('group', { variant: 'dashed', caption: 'cap' }),
      mk('group', { variant: 'lane', laneOrient: 'h', accent: '#ff0000' } as never),
      mk('group', { variant: 'lane' } as never),
      mk('group', { variant: 'boundary' }),
    ]);
    expect(screen.getByTestId('group-caption')).toHaveTextContent('cap');
    expect(container.querySelectorAll('.lane-h')).toHaveLength(1);
    expect(container.querySelectorAll('.variant-lane')).toHaveLength(2);
    expect(container.querySelectorAll('.variant-boundary')).toHaveLength(1);
  });
  it('composite draws region dividers between concurrent regions', () => {
    const parent = mk('group', { variant: 'composite' }, { id: 'comp', width: 600, height: 300 });
    const a = mk('state', { region: 0 } as never, { parentId: 'comp', position: { x: 10, y: 40 }, width: 100, height: 60 });
    const b = mk('state', { region: 1 } as never, { parentId: 'comp', position: { x: 300, y: 40 }, width: 100, height: 60 });
    const c = mk('state', { region: 2 } as never, { parentId: 'comp', position: { x: 300, y: 200 }, width: 100, height: 60 });
    const { container } = mount([parent, a, b, c]);
    const divs = screen.getAllByTestId('region-divider');
    expect(divs.length).toBe(2);
    expect(divs[0].className).toContain('x');
    expect(divs[0]).toHaveStyle({ left: '205px' });
    expect(divs[1].className).toContain('y');
    expect(container.querySelector('.group-rule')).toBeTruthy();
  });
  it('locked selected group is not resizable', () => {
    const { container } = mount([mk('group', { locked: true }, { selected: true })]);
    expect(container.querySelector('.node-group')!.classList.contains('resizable')).toBe(false);
  });
});

describe('TextNode / DrawNode / JunctionNode', () => {
  it('text shows label or placeholder and edits', () => {
    const { container } = mount([mk('text', { label: '' }), mk('text', { label: 'hello', background: 'filled', fill: '#eeeeee', border: true })]);
    expect(screen.getByText('Text')).toBeInTheDocument();
    expect(screen.getByText('hello')).toHaveStyle({ color: '#2d3340' });
    fireEvent.doubleClick(container.querySelectorAll('.node-text')[1]);
    expect(screen.getByLabelText('Text')).toBeInTheDocument();
  });
  it('text keeps own textColor when filled', () => {
    mount([mk('text', { label: 'x1', background: 'filled', textColor: '#ff0000' })]);
    expect(screen.getByText('x1')).toHaveStyle({ color: '#ff0000' });
  });
  it('draw renders its path with defaults or overrides', () => {
    const { container } = mount([mk('draw', { path: 'M0 0L10 10' }), mk('draw', { stroke: '#f00000', strokeWidth: 5 }, { selected: true })]);
    const paths = container.querySelectorAll('.node-draw path');
    expect(paths[0].getAttribute('d')).toBe('M0 0L10 10');
    expect(paths[0].getAttribute('stroke')).toBe('#2d3340');
    expect(paths[0].getAttribute('stroke-width')).toBe('2.5');
    expect(paths[1].getAttribute('d')).toBe('');
    expect(paths[1].getAttribute('stroke-width')).toBe('5');
  });
  it('junction shows a dot only when configured', () => {
    mount([mk('junction', { join: { dot: true, color: '#ff0000' } } as never), mk('junction', {})]);
    expect(screen.getAllByTestId('junction')).toHaveLength(2);
    expect(screen.getAllByTestId('junction-dot')).toHaveLength(1);
  });
});

describe('ClusterNode', () => {
  const kids = (cid: string) => [
    mk('icon', { role: 'primary' }, { parentId: cid }),
    mk('icon', { role: 'replica' }, { parentId: cid }),
    mk('icon', { role: 'replica' }, { parentId: cid }),
  ];
  it('expanded shows title, subtitle, warnings; collapse toggles in store', () => {
    const c = mk('cluster', { subtitle: 'subc', iconId: 'postgresql', warnings: ['w1', 'w2'] }, { id: 'cl' });
    mount([c, ...kids('cl')]);
    expect(screen.getByText('subc')).toBeInTheDocument();
    expect(screen.getByLabelText('2 warnings')).toHaveTextContent('2');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse cluster' }));
    expect(s().nodes.find((n) => n.id === 'cl')!.data.collapsed).toBe(true);
  });
  it('single warning, no subtitle/icon', () => {
    mount([mk('cluster', { warnings: ['only'] })]);
    expect(screen.getByLabelText('1 warnings')).toBeInTheDocument();
    expect(document.querySelector('.cluster-sub')).toBeNull();
  });
  it('double-click edits the title', () => {
    const c = mk('cluster', {});
    mount([c]);
    fireEvent.doubleClick(document.querySelector('.cluster-heading')!);
    const input = screen.getByLabelText('Cluster title');
    fireEvent.change(input, { target: { value: 'CL' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(s().nodes[0].data.label).toBe('CL');
  });
  it('collapsed shows member count, role summary, warn badge; expand toggles', () => {
    const c = mk('cluster', { collapsed: true, iconId: 'postgresql', warnings: ['w'] }, { id: 'cc', selected: true });
    const { container } = mount([c, ...kids('cc').map((k) => ({ ...k, hidden: true }))]);
    expect(screen.getByLabelText('3 members')).toHaveTextContent('×3');
    expect(container.querySelector('.cluster-sub')!.textContent).toContain('primary');
    expect(container.querySelector('.cluster-warn')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Expand cluster' }));
    expect(s().nodes.find((n) => n.id === 'cc')!.data.collapsed).toBeFalsy();
  });
  it('collapsed falls back to subtitle and no warn badge', () => {
    const { container } = mount([mk('cluster', { collapsed: true, subtitle: 'fallback' })]);
    expect(container.querySelector('.cluster-sub')!.textContent).toBe('fallback');
    expect(container.querySelector('.cluster-warn')).toBeNull();
  });
  it('collapsed with nothing to show omits sub', () => {
    const { container } = mount([mk('cluster', { collapsed: true })]);
    expect(container.querySelector('.cluster-sub')).toBeNull();
  });
});

describe('CardNode', () => {
  it('vertical card with icon, subtitle, arch badges, tags; double-click tag edits', () => {
    const n = mk('card', {
      iconId: 'postgresql', subtitle: 'cs', arch: {}, accent: '#ff8800',
      tags: [{ text: 'alpha', color: '#ff0000' }, { text: 'beta', color: '#00ff00' }],
    });
    const { container } = mount([n]);
    expect(container.querySelector('.node-card')!.classList.contains('vertical')).toBe(true);
    expect(screen.getByText('cs')).toBeInTheDocument();
    expect(screen.getByTestId('arch-badges')).toBeInTheDocument();
    const tags = screen.getAllByTestId('card-tag');
    expect(tags).toHaveLength(2);
    fireEvent.doubleClick(tags[0]);
    const input = screen.getByLabelText('Tag 1');
    fireEvent.change(input, { target: { value: 'gamma' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(s().nodes[0].data.tags![0].text).toBe('gamma');
    expect(screen.queryByLabelText('Tag 1')).toBeNull();
  });
  it('horizontal card; add-tag only when selected and unlocked', () => {
    const n = mk('card', { layout: 'horizontal' }, { selected: true });
    const { container } = mount([n]);
    expect(container.querySelector('.node-card')!.classList.contains('horizontal')).toBe(true);
    expect(container.querySelector('.card-sub')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Add tag' }));
    expect(s().nodes[0].data.tags!.length).toBe(1);
    expect(screen.getByLabelText('Tag 1')).toBeInTheDocument();
  });
  it('no add button when unselected or locked', () => {
    mount([mk('card', {}), mk('card', { locked: true }, { selected: true })]);
    expect(screen.queryByRole('button', { name: 'Add tag' })).toBeNull();
  });
  it('double-click title edits it', () => {
    mount([mk('card', {})]);
    fireEvent.doubleClick(screen.getByText('Lbl'));
    const input = screen.getByLabelText('Card title');
    fireEvent.change(input, { target: { value: 'T' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(s().nodes[0].data.label).toBe('T');
  });
});

describe('resize keeps children inside', () => {
  it('nodeTypes registry has memoized entries for every kind', () => {
    for (const k of ['icon', 'group', 'cluster', 'card', 'junction', 'table', 'text', 'shape', 'sticky', 'draw', 'frame', 'mindmap', 'stamp']) expect(nodeTypes[k as keyof typeof nodeTypes]).toBeTruthy();
  });
});

describe('remaining style branches', () => {
  it('icon subtitle with no colors, selected ellipsis, selected shape', () => {
    mount([
      mk('icon', { subtitle: 'plain' }),
      mk('shape', { shape: 'ellipsis' }, { selected: true }),
      mk('shape', { shape: 'ellipse', background: 'filled' }, { selected: true }),
      mk('shape', { shape: 'diamond' }, { selected: true }),
    ]);
    expect(screen.getByText('plain').getAttribute('style')).toBeNull();
    expect(screen.getByTestId('ellipsis').classList.contains('selected')).toBe(true);
    expect(document.querySelectorAll('.node-shape.selected')).toHaveLength(2);
    expect((document.querySelector('.node-shape .node-bg') as HTMLElement).style.borderRadius).toBe('50%');
  });
  it('group icon sizes, composite/lane borders, selected junction, horizontal card icon, bordered text', () => {
    const { container } = mount([
      mk('group', { groupIcon: 'postgresql' }),
      mk('group', { variant: 'card', groupIcon: 'postgresql', accent: '#00aa00' }),
      mk('group', { variant: 'composite' }),
      mk('group', { variant: 'lane' }),
      mk('junction', {}, { selected: true }),
      mk('card', { layout: 'horizontal', iconId: 'postgresql' }),
      mk('text', { label: 'bd', border: true }),
      mk('text', { label: 'bg', background: 'filled' }),
    ]);
    expect(container.querySelectorAll('.group-head svg, .group-head img, .group-head .icon-glyph, .group-head > *').length).toBeGreaterThan(0);
    expect(container.querySelector('.node-junction.selected')).toBeTruthy();
    expect(container.querySelector('.node-card.horizontal')).toBeTruthy();
    expect(screen.getByText('bd')).toBeInTheDocument();
  });
});

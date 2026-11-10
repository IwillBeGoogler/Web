import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlow, ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rz = vi.hoisted(() => ({ calls: 0 }));
vi.mock('@xyflow/react', async (orig) => {
  const actual = await orig<typeof import('@xyflow/react')>();
  return {
    ...actual,
    NodeResizer: (p: { isVisible: boolean; onResizeStart?: () => void; onResizeEnd?: () => void }) => (
      <div data-testid="resizer" data-visible={String(p.isVisible)}>
        <button onClick={p.onResizeStart}>start</button>
        <button onClick={p.onResizeEnd}>end</button>
      </div>
    ),
  };
});

import { DrawNode, GroupNode, StickyNode } from './nodes';
import { useDiagramStore } from '../store/diagramStore';
import type { DiagramNode, DiagramNodeData } from '../types';

const s = () => useDiagramStore.getState();
const mk = (id: string, type: string, data: Partial<DiagramNodeData>, over: Partial<DiagramNode> = {}): DiagramNode =>
  ({ id, type, position: { x: 0, y: 0 }, width: 100, height: 60, data: { label: id, ...data }, ...over }) as DiagramNode;

const types = { group: GroupNode, sticky: StickyNode, draw: DrawNode };
function Flow() {
  const nodes = useDiagramStore((st) => st.nodes);
  return <ReactFlow nodes={nodes} edges={[]} nodeTypes={types} />;
}
function mount(nodes: DiagramNode[]) {
  act(() => useDiagramStore.setState({ nodes }));
  return render(
    <ReactFlowProvider>
      <div style={{ width: 800, height: 600 }}><Flow /></div>
    </ReactFlowProvider>,
  );
}
const pos = (id: string) => s().nodes.find((n) => n.id === id)!.position;

beforeEach(() => { s().reset(); });

describe('legacy StickyNode / DrawNode', () => {
  it('sticky renders, edits its label, resizer visible when selected', () => {
    const { container } = mount([mk('st', 'sticky', { umlNote: true } as never, { selected: true })]);
    expect(container.querySelector('.node-sticky.uml-note.selected')).toBeTruthy();
    expect(screen.getByTestId('resizer').dataset.visible).toBe('true');
    fireEvent.doubleClick(container.querySelector('.node-sticky')!);
    const ta = screen.getByLabelText('Label');
    fireEvent.change(ta, { target: { value: 'edited' } });
    fireEvent.blur(ta);
    expect(s().nodes[0].data.label).toBe('edited');
  });
  it('sticky unselected, transparent background', () => {
    const { container } = mount([mk('st', 'sticky', { background: 'transparent' })]);
    expect((container.querySelector('.node-sticky .node-bg') as HTMLElement).style.background).toBe('transparent');
    expect(screen.getByTestId('resizer').dataset.visible).toBe('false');
  });
  it('draw defaults', () => {
    const { container } = mount([mk('d', 'draw', {}, { selected: true })]);
    const p = container.querySelector('.node-draw.selected path')!;
    expect(p.getAttribute('d')).toBe('');
    expect(p.getAttribute('stroke')).toBe('#2d3340');
    expect(p.getAttribute('stroke-width')).toBe('2.5');
  });
  it('draw renders path', () => {
    const { container } = mount([mk('d', 'draw', { path: 'M0 0L5 5', stroke: '#f00' })]);
    expect(container.querySelector('.node-draw path')!.getAttribute('stroke')).toBe('#f00');
  });
});

describe('keepChildrenInside after a group resize', () => {
  const group = (w: number, h: number) => mk('g', 'group', {}, { width: w, height: h, selected: true });
  const end = () => fireEvent.click(screen.getByRole('button', { name: 'end' }));

  it('clamps children into the shrunk box', () => {
    mount([group(200, 150), mk('a', 'icon', {}, { parentId: 'g', position: { x: 500, y: 500 }, width: 50, height: 40 })]);
    end();
    expect(pos('a')).toEqual({ x: 200 - 50 - 12, y: 150 - 40 - 12 });
  });
  it('slides overlapping siblings right, wrapping to a new row', () => {
    mount([
      group(200, 200),
      mk('a', 'icon', {}, { parentId: 'g', position: { x: 12, y: 40 }, width: 60, height: 40 }),
      mk('b', 'icon', {}, { parentId: 'g', position: { x: 20, y: 45 }, width: 60, height: 40 }),
      mk('c', 'icon', {}, { parentId: 'g', position: { x: 30, y: 50 }, width: 60, height: 40 }),
    ]);
    end();
    expect(pos('a')).toEqual({ x: 12, y: 40 });
    expect(pos('b')).toEqual({ x: 12 + 60 + 16, y: 45 });
    // c overlaps both a and b; no room right of b so wraps below
    expect(pos('c').y).toBeGreaterThanOrEqual(40 + 40 + 16);
  });
  it('grows the box when children cannot fit, ignores hidden kids', () => {
    mount([
      group(100, 80),
      mk('big', 'icon', {}, { parentId: 'g', position: { x: 0, y: 0 }, width: 300, height: 200 }),
      mk('gone', 'icon', {}, { parentId: 'g', hidden: true, position: { x: 5, y: 5 }, width: 10, height: 10 }),
    ]);
    end();
    const g = s().nodes.find((n) => n.id === 'g')!;
    expect(g.width).toBeGreaterThanOrEqual(324);
    expect(g.height).toBeGreaterThanOrEqual(248);
    expect(g.style).toMatchObject({ width: g.width, height: g.height });
    expect(pos('gone')).toEqual({ x: 5, y: 5 });
  });
  it('is a no-op when there are no children, or the box is unchanged', () => {
    mount([group(300, 300), mk('a', 'icon', {}, { parentId: 'g', position: { x: 50, y: 60 }, width: 40, height: 40 })]);
    const before = s().nodes;
    end();
    expect(s().nodes.find((n) => n.id === 'a')!.position).toEqual({ x: 50, y: 60 });
    expect(s().nodes.find((n) => n.id === 'g')!.width).toBe(300);
    expect(before.length).toBe(2);
  });
  it('no children: store untouched', () => {
    mount([group(300, 300)]);
    const ref = s().nodes;
    end();
    expect(s().nodes).toBe(ref);
  });
  it('resizer start snapshots for undo', () => {
    const spy = vi.fn();
    useDiagramStore.setState({ snapshot: spy as never });
    mount([group(300, 300)]);
    fireEvent.click(screen.getByRole('button', { name: 'start' }));
    expect(spy).toHaveBeenCalled();
  });
});

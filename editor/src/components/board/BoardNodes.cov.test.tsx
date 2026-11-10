import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const A = vi.hoisted(() => ({
  addNextStickyFrom: vi.fn(), isMasked: vi.fn(() => false), mmAddChild: vi.fn(), mmAddSibling: vi.fn(), mmPromote: vi.fn(), mmSetLabel: vi.fn(), mmToggleCollapse: vi.fn(), myBoardId: vi.fn(() => 'me'),
}));
vi.mock('../../lib/board/actions', () => A);
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { encodePoints } from '../../lib/board/freehand';
import { DrawBoardNode, FrameNode, MindMapNode, StampNode, StickyBoardNode } from './BoardNodes';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const props = (id: string, data: Record<string, unknown>, extra: Record<string, unknown> = {}): any => ({ id, data, selected: false, type: 'x', dragging: false, zIndex: 0, isConnectable: true, positionAbsoluteX: 0, positionAbsoluteY: 0, ...extra });
const mount = (ui: React.ReactElement) => render(<ReactFlowProvider>{ui}</ReactFlowProvider>);
const editing = (id: string | null, seed: string | null = null) => act(() => useUiStore.getState().setEditing(id, seed));

beforeEach(() => {
  Object.values(A).forEach((f) => f.mockClear());
  A.isMasked.mockReturnValue(false);
  useDiagramStore.getState().reset();
  editing(null);
  useUiStore.getState().setMmDrop(null);
});

describe('StickyBoardNode', () => {
  it('shows text, author and private lock; selected / uml-note classes; double click edits', () => {
    const { container } = mount(<StickyBoardNode {...props('s', { label: 'Hello', author: 'Ann', private: true, umlNote: true, bold: true }, { selected: true })} />);
    expect(container.querySelector('.node-sticky')!.className).toBe('node-sticky uml-note selected');
    expect(container.querySelector('.sticky-text')!.textContent).toBe('Hello');
    expect(container.querySelector('.sticky-author')!.textContent).toBe('Ann');
    expect(screen.getByLabelText('Private until revealed')).toBeTruthy();
    fireEvent.doubleClick(container.querySelector('.node-sticky')!);
    expect(useUiStore.getState().editingId).toBe('s');
  });
  it('auto font fits the box; manual font size is used otherwise', () => {
    const { container, unmount } = mount(<StickyBoardNode {...props('s', { label: 'x', autoFont: true }, { width: 200, height: 160 })} />);
    expect(parseInt((container.querySelector('.sticky-text') as HTMLElement).style.fontSize)).toBeGreaterThan(14);
    unmount();
    const r = mount(<StickyBoardNode {...props('s', { label: 'x', fontSize: 20 })} />);
    expect((r.container.querySelector('.sticky-text') as HTMLElement).style.fontSize).toBe('20px');
    r.unmount();
    const d = mount(<StickyBoardNode {...props('s', { label: 'x' })} />);
    expect((d.container.querySelector('.sticky-text') as HTMLElement).style.fontSize).toBe('14px');
  });
  it('masked: shows lock with author or Hidden, no editing, no author/private marks', () => {
    A.isMasked.mockReturnValue(true);
    const { container, rerender } = mount(<StickyBoardNode {...props('s', { label: 'secret', author: 'Bo', private: true })} />);
    expect(screen.getByTestId('sticky-masked')).toBeTruthy();
    expect(container.querySelector('.sticky-hidden')!.textContent).toBe("Bo's idea");
    expect(container.querySelector('.sticky-text')).toBeNull();
    expect(container.querySelector('.sticky-author')).toBeNull();
    fireEvent.doubleClick(screen.getByTestId('sticky-masked'));
    expect(useUiStore.getState().editingId).toBeNull();
    rerender(<ReactFlowProvider><StickyBoardNode {...props('s', { label: 'secret' })} /></ReactFlowProvider>);
    expect(container.querySelector('.sticky-hidden')!.textContent).toBe('Hidden');
  });
  it('editing: live text, commit writes the label; Tab / Shift+Enter add the next sticky; other keys pass', () => {
    useDiagramStore.setState({ nodes: [{ id: 's', type: 'sticky', position: { x: 0, y: 0 }, data: { label: 'old' } } as never] });
    mount(<StickyBoardNode {...props('s', { label: 'old', autoFont: true }, { width: 100, height: 80 })} />);
    editing('s');
    const ta = screen.getByLabelText('Sticky text') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'new text' } });
    fireEvent.keyDown(ta, { key: 'Tab' });
    expect(A.addNextStickyFrom).toHaveBeenCalledWith('s', 'right');
    expect(useDiagramStore.getState().nodes[0].data.label).toBe('new text');
  });
  it('Shift+Enter adds below; Shift+Tab and plain Enter do not; blur ends editing', () => {
    mount(<StickyBoardNode {...props('s', { label: 'old' })} />);
    editing('s');
    const ta = screen.getByLabelText('Sticky text');
    fireEvent.keyDown(ta, { key: 'Enter', shiftKey: true });
    expect(A.addNextStickyFrom).toHaveBeenCalledWith('s', 'below');
    A.addNextStickyFrom.mockClear();
    fireEvent.keyDown(ta, { key: 'Tab', shiftKey: true });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(A.addNextStickyFrom).not.toHaveBeenCalled();
    fireEvent.blur(ta);
    expect(useUiStore.getState().editingId).toBeNull();
  });
});

describe('FrameNode', () => {
  it('title (default Frame), accent, selected; edit via double click commits the name', () => {
    useDiagramStore.setState({ nodes: [{ id: 'f', type: 'frame', position: { x: 0, y: 0 }, data: { label: '' } } as never] });
    const { container } = mount(<FrameNode {...props('f', { label: '', accent: '#f00' }, { selected: true })} />);
    expect(container.querySelector('.node-frame')!.className).toBe('node-frame selected');
    expect((container.querySelector('.node-frame') as HTMLElement).style.getPropertyValue('--frame-accent')).toBe('#f00');
    expect(screen.getByTestId('frame-title').textContent).toBe('Frame');
    fireEvent.doubleClick(screen.getByTestId('frame-title'));
    expect(useUiStore.getState().editingId).toBe('f');
    const input = screen.getByLabelText('Frame name');
    fireEvent.change(input, { target: { value: 'Plan' } });
    fireEvent.blur(input);
    expect(useDiagramStore.getState().nodes[0].data.label).toBe('Plan');
  });
  it('default accent and label', () => {
    const { container } = mount(<FrameNode {...props('f', { label: 'Mine' })} />);
    expect((container.querySelector('.node-frame') as HTMLElement).style.getPropertyValue('--frame-accent')).toBe('#5b5bf7');
    expect(screen.getByTestId('frame-title').textContent).toBe('Mine');
  });
});

describe('MindMapNode', () => {
  const mm = (data: Record<string, unknown>, extra: Record<string, unknown> = {}) => mount(<MindMapNode {...props('m', { label: 'Topic', ...data }, extra)} />);
  it('root: central idea default, + buttons left and right, no sibling; no toggle without children', () => {
    const { container } = mm({ label: '', root: true }, { selected: true });
    expect(container.querySelector('.node-mindmap')!.className).toBe('node-mindmap root selected');
    expect(container.querySelector('.mm-label')!.textContent).toBe('Central idea');
    fireEvent.click(screen.getByRole('button', { name: 'Add a topic on the right' }));
    fireEvent.click(screen.getByRole('button', { name: 'Add a topic on the left' }));
    expect(A.mmAddChild.mock.calls).toEqual([['m', 'r'], ['m', 'l']]);
    expect(screen.queryByRole('button', { name: 'Add a sibling' })).toBeNull();
    expect(container.querySelector('.mm-toggle')).toBeNull();
  });
  it('child on the right shows subtopic + and sibling +; left child shows the left +; idea default', () => {
    const { container, unmount } = mm({ label: '' }, { selected: true });
    expect(container.querySelector('.mm-label')!.textContent).toBe('Idea');
    expect(screen.getAllByRole('button', { name: 'Add a subtopic' })).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Add a sibling' }));
    expect(A.mmAddSibling).toHaveBeenCalledWith('m');
    unmount();
    mm({ side: 'l' }, { selected: true });
    const btn = screen.getByRole('button', { name: 'Add a subtopic' });
    expect(btn.className).toContain(' l');
    fireEvent.click(btn);
    expect(A.mmAddChild).toHaveBeenCalledWith('m', 'l');
  });
  it('drop highlight; branch toggle collapses / expands with hidden count', () => {
    useDiagramStore.setState({
      edges: [{ id: 'e1', source: 'm', target: 'c1' }, { id: 'e2', source: 'c1', target: 'c2' }] as never,
      nodes: [] as never,
    });
    act(() => useUiStore.getState().setMmDrop('m'));
    const { container, unmount } = mm({});
    expect(container.querySelector('.node-mindmap')!.className).toContain('mm-drop');
    fireEvent.click(screen.getByRole('button', { name: 'Collapse branch' }));
    expect(A.mmToggleCollapse).toHaveBeenCalledWith('m');
    expect(screen.getByRole('button', { name: 'Collapse branch' }).getAttribute('aria-expanded')).toBe('true');
    unmount();
    mm({ collapsed: true });
    const t = screen.getByRole('button', { name: 'Expand branch (2 hidden)' });
    expect(t.textContent).toBe('2');
    expect(t.className).toContain('collapsed');
    expect(t.getAttribute('title')).toBe('2 hidden');
  });
  it('editing: seed, commit sets label; Tab adds child, Shift+Tab promotes, Enter adds sibling, Cmd+Enter falls through; + buttons hidden', () => {
    const { container } = mm({}, { selected: true });
    editing('m', 'se');
    const input = screen.getByLabelText('Mind map text') as HTMLInputElement;
    expect(input.value).toBe('se');
    expect(container.querySelector('.mm-plus')).toBeNull();
    fireEvent.change(input, { target: { value: 'changed' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(A.mmSetLabel).toHaveBeenCalledWith('m', 'changed');
    expect(A.mmAddChild).toHaveBeenCalledWith('m');
    fireEvent.keyDown(input, { key: 'Tab', shiftKey: true });
    expect(A.mmPromote).toHaveBeenCalledWith('m');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(A.mmAddSibling).toHaveBeenCalledWith('m');
    A.mmAddSibling.mockClear();
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true });
    expect(A.mmAddSibling).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: 'a' });
    fireEvent.doubleClick(container.querySelector('.node-mindmap')!);
    expect(useUiStore.getState().editingId).toBe('m');
  });
  it('editor ends with done', () => {
    mm({});
    editing('m');
    fireEvent.keyDown(screen.getByLabelText('Mind map text'), { key: 'Escape' });
    expect(useUiStore.getState().editingId).toBeNull();
  });
});

describe('StampNode', () => {
  it('shows the emoji sized by the smaller side, default thumbs-up', () => {
    const { container, unmount } = mount(<StampNode {...props('st', { emoji: '🔥' }, { selected: true, width: 100, height: 40 })} />);
    const img = screen.getByRole('img', { name: 'Stamp' });
    expect(img.textContent).toBe('🔥');
    expect(img.style.fontSize).toMatch(/^31\.2/);
    expect(container.querySelector('.node-stamp')!.className).toBe('node-stamp selected');
    unmount();
    mount(<StampNode {...props('st', {})} />);
    expect(screen.getByRole('img', { name: 'Stamp' }).textContent).toBe('👍');
  });
});

describe('DrawBoardNode', () => {
  it('legacy path stroke', () => {
    const { container } = mount(<DrawBoardNode {...props('d', { path: 'M0 0 L5 5', stroke: '#abc', strokeWidth: 4 }, { selected: true })} />);
    const p = container.querySelector('path')!;
    expect(p.getAttribute('d')).toBe('M0 0 L5 5');
    expect(p.getAttribute('stroke')).toBe('#abc');
    expect(p.getAttribute('stroke-width')).toBe('4');
    expect(container.querySelector('.node-draw')!.className).toBe('node-draw selected');
  });
  it('defaults for a legacy path without style', () => {
    const { container } = mount(<DrawBoardNode {...props('d', {})} />);
    const p = container.querySelector('path')!;
    expect(p.getAttribute('d')).toBe('');
    expect(p.getAttribute('stroke')).toBe('#2d3340');
    expect(p.getAttribute('stroke-width')).toBe('2.5');
  });
  it('point-based strokes are filled outlines; highlighter is translucent', () => {
    const pts = encodePoints([{ x: 0, y: 0, p: 0.5 }, { x: 10, y: 10, p: 0.5 }, { x: 20, y: 5, p: 0.5 }] as never);
    const { container, unmount } = mount(<DrawBoardNode {...props('d', { pts, stroke: '#111' })} />);
    let p = container.querySelector('path')!;
    expect(p.getAttribute('fill')).toBe('#111');
    expect(p.getAttribute('fill-opacity')).toBe('1');
    expect(p.getAttribute('d')!.length).toBeGreaterThan(0);
    unmount();
    const h = mount(<DrawBoardNode {...props('d', { pts, brush: 'highlighter' })} />);
    p = h.container.querySelector('path')!;
    expect(p.getAttribute('fill-opacity')).toBe('0.38');
    expect(h.container.querySelector('.node-draw')!.className).toContain('highlighter');
  });
});

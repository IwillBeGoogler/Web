import { beforeEach, describe, expect, it } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { useBoardStore } from '../../store/boardStore';
import { useSession } from '../../api/session';
import { useSettingsStore } from '../../store/settingsStore';
import { canvasInk } from '../contrast';
import { addFrameFor, addNextStickyFrom, arrangeSelected, commitStroke, createMindMapAt, createStickyAt, eraseAt, isMasked, mmAddChild, mmAddSibling, mmImport, mmLayoutAll, mmToggleCollapse, reorderFrame, revealAll, stampAt } from './actions';
import { childrenOf, toOutline } from './mindmap';
import { orderedFrames } from './frames';
import { STICKY_COLORS } from './sticky';

const st = () => useDiagramStore.getState();
const types = () => st().nodes.map((n) => n.type);

beforeEach(() => {
  st().reset();
  useUiStore.getState().resetUi();
  useBoardStore.getState().reset();
  useSession.getState().reset();
});

describe('stickies', () => {
  it('createStickyAt adds a selected sticky in edit mode with the chosen colour', () => {
    useBoardStore.getState().set({ stickyColor: 'pink' });
    const id = createStickyAt({ x: 300, y: 200 });
    const n = st().nodes.find((x) => x.id === id)!;
    expect(n.type).toBe('sticky');
    expect(n.data.fill).toBe(STICKY_COLORS.find((c) => c.id === 'pink')!.fill);
    expect(n.selected).toBe(true);
    expect(useUiStore.getState().editingId).toBe(id);
  });
  it('tags the author only when asked and marks private stickies with the author id', () => {
    useSession.getState().setUser({ id: 'u1', email: 'a@b.c', name: 'Ann', isAdmin: false });
    const plainId = createStickyAt({ x: 0, y: 0 });
    const plain = st().nodes.find((n) => n.id === plainId)!;
    expect(plain.data.author).toBeUndefined();
    useBoardStore.getState().set({ showAuthor: true, privateMode: true });
    const taggedId = createStickyAt({ x: 400, y: 0 });
    const tagged = st().nodes.find((n) => n.id === taggedId)!;
    expect(tagged.data).toMatchObject({ author: 'Ann', authorId: 'u1', private: true });
  });
  it('Tab flow: next sticky to the right, Shift+Enter below, each editing and selected', () => {
    const a = createStickyAt({ x: 100, y: 100 });
    const b = addNextStickyFrom(a, 'right')!;
    expect(st().nodes.find((n) => n.id === b)!.position.x).toBeGreaterThan(st().nodes.find((n) => n.id === a)!.position.x);
    expect(useUiStore.getState().editingId).toBe(b);
    expect(st().nodes.find((n) => n.id === a)!.selected).toBeFalsy();
    const c = addNextStickyFrom(b, 'below')!;
    expect(st().nodes.find((n) => n.id === c)!.position.y).toBeGreaterThan(st().nodes.find((n) => n.id === b)!.position.y);
    expect(addNextStickyFrom('nope', 'right')).toBeNull();
  });
  it('isMasked hides other people\'s private stickies only', () => {
    const n = { id: 's', type: 'sticky' as const, position: { x: 0, y: 0 }, data: { label: 'x', private: true, authorId: 'u1' } };
    expect(isMasked(n, 'u1')).toBe(false);
    expect(isMasked(n, 'u2')).toBe(true);
    expect(isMasked({ ...n, data: { ...n.data, private: false } }, 'u2')).toBe(false);
    expect(isMasked({ ...n, type: 'text' as never }, 'u2')).toBe(false);
  });
  it('revealAll clears the private flag of every sticky in one undo step', () => {
    useBoardStore.getState().set({ privateMode: true });
    useSession.getState().setUser({ id: 'u1', email: 'a@b.c', name: 'Ann', isAdmin: false });
    createStickyAt({ x: 0, y: 0 });
    createStickyAt({ x: 300, y: 0 });
    expect(st().nodes.filter((n) => n.data.private)).toHaveLength(2);
    expect(revealAll()).toBe(2);
    expect(st().nodes.some((n) => n.data.private)).toBe(false);
    expect(revealAll()).toBe(0);
    st().undo();
    expect(st().nodes.filter((n) => n.data.private)).toHaveLength(2);
  });
});

describe('arrange', () => {
  it('grid and group-by-colour move the selected stickies (one undo step)', () => {
    useBoardStore.getState().set({ stickyColor: 'blue' });
    createStickyAt({ x: 0, y: 0 });
    useBoardStore.getState().set({ stickyColor: 'pink' });
    createStickyAt({ x: 50, y: 400 });
    useBoardStore.getState().set({ stickyColor: 'blue' });
    createStickyAt({ x: 900, y: 10 });
    st().selectAll();
    const before = st().nodes.map((n) => n.position);
    expect(arrangeSelected('color')).toBe(3);
    const after = st().nodes.map((n) => n.position);
    expect(after).not.toEqual(before);
    st().undo();
    expect(st().nodes.map((n) => n.position)).toEqual(before);
    expect(arrangeSelected('grid')).toBe(3);
  });
  it('needs a selection', () => {
    expect(arrangeSelected('grid')).toBe(0);
  });
});

describe('frames', () => {
  it('wraps the selection with padding, or uses the given rect', () => {
    createStickyAt({ x: 0, y: 0 });
    st().selectAll();
    const id = addFrameFor({ x: 0, y: 0 })!;
    const f = st().nodes.find((n) => n.id === id)!;
    const s = st().nodes.find((n) => n.type === 'sticky')!;
    expect(f.type).toBe('frame');
    expect(f.position.x).toBeLessThan(s.position.x);
    expect(f.width!).toBeGreaterThan(s.width!);
    expect(f.data.label).toBe('Frame 1');
    expect(f.zIndex).toBe(-1);
  });
  it('creates a default-size frame centred on a point when nothing is selected', () => {
    const id = addFrameFor({ x: 500, y: 300 })!;
    const f = st().nodes.find((n) => n.id === id)!;
    expect(f.position.x + f.width! / 2).toBe(500);
  });
  it('reorderFrame writes the order into the frames', () => {
    const a = addFrameFor({ x: 0, y: 0 })!;
    const b = addFrameFor({ x: 2000, y: 0 })!;
    const c = addFrameFor({ x: 4000, y: 0 })!;
    reorderFrame(c, 0);
    expect(orderedFrames(st().nodes).map((f) => f.id)).toEqual([c, a, b]);
  });
});

describe('mind map', () => {
  it('Tab adds a child, Enter a sibling, both laid out and selected', () => {
    const root = createMindMapAt({ x: 0, y: 0 });
    const c1 = mmAddChild(root)!;
    const c2 = mmAddSibling(c1)!;
    expect(childrenOf(st().nodes, st().edges, root).map((n) => n.id)).toEqual([c1, c2]);
    expect(st().edges).toHaveLength(2);
    expect(useUiStore.getState().editingId).toBe(c2);
    expect(st().nodes.find((n) => n.id === c2)!.position.y).not.toBe(st().nodes.find((n) => n.id === c1)!.position.y);
  });
  it('collapse hides descendants (and their edges) and expand shows them again', () => {
    const root = createMindMapAt({ x: 0, y: 0 });
    const a = mmAddChild(root)!;
    mmAddChild(a);
    mmAddChild(a);
    mmToggleCollapse(a);
    expect(st().nodes.filter((n) => n.hidden)).toHaveLength(2);
    expect(st().edges.filter((e) => e.hidden)).toHaveLength(2);
    mmToggleCollapse(a);
    expect(st().nodes.some((n) => n.hidden)).toBe(false);
    expect(st().edges.some((e) => e.hidden)).toBe(false);
  });
  it('imports an outline at a point and exports it back', () => {
    const root = mmImport('# Plan\n- A\n  - A1\n- B', { x: 100, y: 100 })!;
    expect(toOutline(st().nodes, st().edges, root)).toBe('# Plan\n- A\n  - A1\n- B');
    expect(mmImport('   ', { x: 0, y: 0 })).toBeNull();
    mmLayoutAll();
  });
});

describe('freehand', () => {
  const line = Array.from({ length: 30 }, (_, i) => ({ x: i * 8, y: Math.sin(i / 4) * 10, p: 0.5 }));
  it('commits a stroke as a draw node', () => {
    const id = commitStroke(line, 'pen')!;
    const n = st().nodes.find((x) => x.id === id)!;
    expect(n.type).toBe('draw');
    expect(n.data.brush).toBe('pen');
  });
  it('the default pen colour follows the canvas: dark ink on a light canvas, light ink on a dark one', () => {
    expect(useBoardStore.getState().penColor).toBe('auto');
    const lightId = commitStroke(line, 'pen')!;
    const light = st().nodes.find((x) => x.id === lightId)!;
    expect(light.data.stroke).toBe(canvasInk('#ffffff'));
    useSettingsStore.getState().patch({ canvas: { background: '#12151c' } });
    const darkId = commitStroke(line, 'pen')!;
    const dark = st().nodes.find((x) => x.id === darkId)!;
    expect(dark.data.stroke).toBe(canvasInk('#12151c'));
    expect(dark.data.stroke).not.toBe(light.data.stroke);
    useSettingsStore.getState().resetGlobal();
  });
  it('an explicit pen colour is kept', () => {
    useBoardStore.getState().set({ penColor: '#d1344a' });
    const id = commitStroke(line, 'pen')!;
    expect(st().nodes.find((x) => x.id === id)!.data.stroke).toBe('#d1344a');
  });
  it('highlighter uses the highlighter colour and size', () => {
    const id = commitStroke(line, 'highlighter')!;
    expect(st().nodes.find((x) => x.id === id)!.data).toMatchObject({ brush: 'highlighter', strokeWidth: useBoardStore.getState().hlSize });
  });
  it('with shape recognition a rough circle becomes a clean ellipse shape', () => {
    useBoardStore.getState().set({ recognize: true });
    const circle = Array.from({ length: 61 }, (_, i) => ({ x: 100 + 70 * Math.cos((i / 60) * 6.283) + (i % 3), y: 100 + 70 * Math.sin((i / 60) * 6.283) - (i % 2), p: 0.5 }));
    const id = commitStroke(circle, 'pen')!;
    expect(st().nodes.find((x) => x.id === id)!.type).toBe('shape');
  });
  it('recognition off keeps the freehand stroke', () => {
    const circle = Array.from({ length: 61 }, (_, i) => ({ x: 100 + 70 * Math.cos((i / 60) * 6.283), y: 100 + 70 * Math.sin((i / 60) * 6.283), p: 0.5 }));
    const id = commitStroke(circle, 'pen')!;
    expect(st().nodes.find((x) => x.id === id)!.type).toBe('draw');
  });
  it('highlighter strokes are never replaced by shapes', () => {
    useBoardStore.getState().set({ recognize: true });
    const circle = Array.from({ length: 61 }, (_, i) => ({ x: 100 + 70 * Math.cos((i / 60) * 6.283), y: 100 + 70 * Math.sin((i / 60) * 6.283), p: 0.5 }));
    const id = commitStroke(circle, 'highlighter')!;
    expect(st().nodes.find((x) => x.id === id)!.type).toBe('draw');
  });
  it('rejects a dot', () => {
    expect(commitStroke([{ x: 1, y: 1, p: 0.5 }], 'pen')).toBeNull();
  });
  it('the eraser deletes only the strokes it touches', () => {
    const a = commitStroke(line, 'pen')!;
    const b = commitStroke(line.map((p) => ({ ...p, y: p.y + 500 })), 'pen')!;
    expect(eraseAt({ x: 40, y: 5 }, 14)).toBe(1);
    expect(st().nodes.some((n) => n.id === a)).toBe(false);
    expect(st().nodes.some((n) => n.id === b)).toBe(true);
    expect(eraseAt({ x: 4000, y: 4000 }, 14)).toBe(0);
  });
});

describe('stamps', () => {
  it('places a persistent emoji stamp', () => {
    const id = stampAt({ x: 50, y: 60 }, '🎉');
    const n = st().nodes.find((x) => x.id === id)!;
    expect(n.type).toBe('stamp');
    expect(n.data.emoji).toBe('🎉');
    expect(types()).toContain('stamp');
  });
});

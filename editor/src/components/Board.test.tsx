import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { useBoardStore } from '../store/boardStore';
import { seedProject } from '../test/workspace';
import { createFrame } from '../lib/board/frames';
import { addFrameFor, createMindMapAt, createStickyAt } from '../lib/board/actions';
import { executeAction } from '../lib/actions';
import { useEditorSession } from '../sync/status';

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  useBoardStore.getState().reset();
});
const open = () => render(<App initialProjectId={seedProject('Board').projectId} />);
const dock = () => screen.getByRole('toolbar', { name: 'Tools' });
const st = () => useDiagramStore.getState();

describe('dock', () => {
  it('has sticky, frame, mind map and an emoji button; the Frames button only appears once a frame exists', async () => {
    open();
    for (const l of ['Sticky note', 'Frame', 'Mind map', 'Reactions and stamps']) expect(within(dock()).getByLabelText(l)).toBeTruthy();
    expect(within(dock()).queryByLabelText('Frames')).toBeNull();
    await act(async () => void st().addNode(createFrame('f1', { x: 0, y: 0, width: 400, height: 300 }, 'Intro')));
    expect(within(dock()).getByLabelText('Frames')).toBeTruthy();
  });
  it('nothing extra is shown by default: no board options, no popovers', () => {
    open();
    expect(screen.queryByRole('group', { name: 'Sticky options' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Frames' })).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
  });
  it('the sticky tool shows its 8 colours; picking one is remembered; the pen shows brush, colour, size and shape recognition', async () => {
    open();
    await act(async () => void fireEvent.click(within(dock()).getByLabelText('Sticky note')));
    const opts = screen.getByRole('group', { name: 'Sticky options' });
    expect(within(opts).getAllByRole('button', { pressed: undefined }).filter((b) => b.classList.contains('sticky-swatch'))).toHaveLength(8);
    await act(async () => void fireEvent.click(within(opts).getByLabelText('Pink')));
    expect(useBoardStore.getState().stickyColor).toBe('pink');
    await act(async () => void fireEvent.click(within(dock()).getByLabelText('Pen')));
    const draw = screen.getByRole('group', { name: 'Drawing options' });
    for (const n of ['Pen', 'Highlighter', 'Eraser', 'Shapes']) expect(within(draw).getByRole('button', { name: n })).toBeTruthy();
    await act(async () => void fireEvent.click(within(draw).getByRole('button', { name: 'Shapes' })));
    expect(useBoardStore.getState().recognize).toBe(true);
    await act(async () => void fireEvent.click(within(draw).getByRole('button', { name: 'Eraser' })));
    expect(useUiStore.getState().tool).toBe('eraser');
    expect(within(screen.getByRole('group', { name: 'Drawing options' })).queryByRole('button', { name: 'Shapes' })).toBeNull();
  });
});

describe('keyboard', () => {
  const key = (k: string, extra: KeyboardEventInit = {}) => fireEvent.keyDown(document.body, { key: k, ...extra });
  it('S selects the sticky tool, F frame, W mind map', async () => {
    open();
    await act(async () => void key('s'));
    expect(useUiStore.getState().tool).toBe('sticky');
    await act(async () => void key('f'));
    expect(useUiStore.getState().tool).toBe('frame');
    await act(async () => void key('w'));
    expect(useUiStore.getState().tool).toBe('mindmap');
  });
  it('Tab on a selected sticky adds the next one to the right, Shift+Enter below', async () => {
    open();
    let a = '';
    await act(async () => { a = createStickyAt({ x: 200, y: 200 }); useUiStore.getState().setEditing(null); });
    await act(async () => void key('Tab'));
    expect(st().nodes.filter((n) => n.type === 'sticky')).toHaveLength(2);
    await act(async () => void key('Enter', { shiftKey: true }));
    const s = st().nodes.filter((n) => n.type === 'sticky');
    expect(s).toHaveLength(3);
    expect(s.find((n) => n.id === a)).toBeTruthy();
  });
  it('typing in a sticky and pressing Tab commits the text and moves on to a new sticky in edit mode', async () => {
    open();
    let a = '';
    await act(async () => { a = createStickyAt({ x: 200, y: 200 }); });
    const ta = await screen.findByLabelText('Sticky text');
    await act(async () => { fireEvent.change(ta, { target: { value: 'first idea' } }); fireEvent.keyDown(ta, { key: 'Tab' }); });
    expect(st().nodes.find((n) => n.id === a)!.data.label).toBe('first idea');
    expect(st().nodes.filter((n) => n.type === 'sticky')).toHaveLength(2);
    expect(await screen.findByLabelText('Sticky text')).toBeTruthy();
  });
  it('Tab adds a mind map child and Enter a sibling', async () => {
    open();
    let root = '';
    await act(async () => { root = createMindMapAt({ x: 0, y: 0 }); useUiStore.getState().setEditing(null); });
    await act(async () => void key('Tab'));
    await act(async () => void key('Enter'));
    expect(st().nodes.filter((n) => n.type === 'mindmap')).toHaveLength(3);
    expect(st().edges.every((e) => e.source === root)).toBe(true);
  });
  it('a selected mind map node shows "+" buttons: left and right on the root, one below for a sibling; clicking creates the node in edit mode', async () => {
    open();
    let root = '';
    await act(async () => { root = createMindMapAt({ x: 0, y: 0 }); useUiStore.getState().setEditing(null); st().selectOnly('node', root); });
    expect(screen.queryByLabelText('Add a sibling')).toBeNull(); // the root has no sibling
    await act(async () => void fireEvent.click(screen.getByLabelText('Add a topic on the left')));
    const left = st().nodes.find((n) => n.type === 'mindmap' && !n.data.root)!;
    expect(left.data.side).toBe('l');
    expect(useUiStore.getState().editingId).toBe(left.id);
    await act(async () => { useUiStore.getState().setEditing(null); st().selectOnly('node', root); });
    await act(async () => void fireEvent.click(screen.getByLabelText('Add a topic on the right')));
    expect(st().nodes.filter((n) => n.type === 'mindmap' && n.data.side === 'r')).toHaveLength(1);
    const kid = st().nodes.find((n) => n.id === useUiStore.getState().editingId)!;
    await act(async () => { useUiStore.getState().setEditing(null); st().selectOnly('node', kid.id); });
    await act(async () => void fireEvent.click(screen.getByLabelText('Add a sibling')));
    expect(st().edges.filter((e) => e.source === root)).toHaveLength(3);
  });
  it('arrow keys move between mind map nodes, Shift+Tab promotes, the inspector stays closed', async () => {
    open();
    let root = '';
    await act(async () => { root = createMindMapAt({ x: 0, y: 0 }); useUiStore.getState().setEditing(null); });
    await act(async () => void key('Tab'));
    const child = st().nodes.find((n) => n.id === useUiStore.getState().editingId)!;
    await act(async () => { useUiStore.getState().setEditing(null); st().selectOnly('node', child.id); });
    expect(screen.queryByText('Mind map', { selector: '.acc-title, h3, summary' })).toBeNull();
    await act(async () => void key('ArrowLeft'));
    expect(st().nodes.find((n) => n.selected)!.id).toBe(root);
    await act(async () => void key('ArrowRight'));
    expect(st().nodes.find((n) => n.selected)!.id).toBe(child.id);
    await act(async () => void key('Tab'));
    await act(async () => { useUiStore.getState().setEditing(null); });
    const grand = st().nodes.find((n) => n.selected)!;
    await act(async () => void key('Tab', { shiftKey: true }));
    expect(st().edges.find((e) => e.target === grand.id)!.source).toBe(root);
  });
  it('? opens the cheatsheet with the shortcuts and Esc closes it', async () => {
    open();
    await act(async () => void key('?', { shiftKey: true, code: 'Slash' }));
    const sheet = screen.getByRole('dialog', { name: 'Keyboard shortcuts' });
    for (const t of ['Tools', 'Stickies', 'Mind map', 'Present']) expect(within(sheet).getByRole('heading', { name: t })).toBeTruthy();
    await act(async () => void fireEvent.keyDown(window, { key: 'Escape' }));
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).toBeNull();
  });
});

describe('frames popover', () => {
  it('lists frames in order, zooms on click, reorders with the arrows and copies a link', async () => {
    open();
    await act(async () => {
      st().addNode(createFrame('a', { x: 0, y: 0, width: 400, height: 300 }, 'Alpha'));
      st().addNode(createFrame('b', { x: 600, y: 0, width: 400, height: 300 }, 'Beta'));
    });
    await act(async () => void fireEvent.click(within(dock()).getByLabelText('Frames')));
    const pop = screen.getByRole('dialog', { name: 'Frames' });
    expect(within(pop).getAllByRole('listitem').map((l) => l.textContent)).toEqual([expect.stringContaining('Alpha'), expect.stringContaining('Beta')]);
    await act(async () => void fireEvent.click(within(pop).getByLabelText('Move Beta up')));
    expect(within(screen.getByRole('dialog', { name: 'Frames' })).getAllByRole('listitem')[0].textContent).toContain('Beta');
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write }, configurable: true });
    await act(async () => void fireEvent.click(within(pop).getByLabelText('Copy link to Alpha')));
    expect(write).toHaveBeenCalledWith(expect.stringMatching(/#frame=a$/));
  });
  it('shows an empty hint when opened from the palette without frames', async () => {
    open();
    await act(async () => void executeAction('board-frames'));
    expect(within(screen.getByRole('dialog', { name: 'Frames' })).getByText(/No frames yet/)).toBeTruthy();
  });
});

describe('presentation', () => {
  it('needs a frame; steps with the arrow keys; P toggles the laser; Esc exits and restores the chrome', async () => {
    open();
    await act(async () => void executeAction('board-present'));
    expect(screen.queryByTestId('present-surface')).toBeNull();
    await act(async () => {
      st().addNode(createFrame('a', { x: 0, y: 0, width: 400, height: 300 }, 'Alpha'));
      st().addNode(createFrame('b', { x: 600, y: 0, width: 400, height: 300 }, 'Beta'));
    });
    await act(async () => void executeAction('board-present'));
    const bar = screen.getByRole('toolbar', { name: 'Presentation' });
    expect(within(bar).getByText(/1 \/ 2/)).toBeTruthy();
    await act(async () => void fireEvent.keyDown(window, { key: 'ArrowRight' }));
    expect(within(bar).getByText(/2 \/ 2/)).toBeTruthy();
    await act(async () => void fireEvent.keyDown(window, { key: 'ArrowRight' }));
    expect(within(bar).getByText(/2 \/ 2/)).toBeTruthy();
    await act(async () => void fireEvent.keyDown(window, { key: 'p' }));
    expect(useBoardStore.getState().presenting?.laser).toBe(true);
    expect(document.querySelector('.app')!.classList.contains('presenting')).toBe(true);
    await act(async () => void fireEvent.keyDown(window, { key: 'Escape' }));
    expect(screen.queryByTestId('present-surface')).toBeNull();
    expect(document.querySelector('.app')!.classList.contains('presenting')).toBe(false);
  });
});

describe('context menu actions', () => {
  it('wrapping a selection adds a frame around it and selects the frame', async () => {
    open();
    await act(async () => { createStickyAt({ x: 100, y: 100 }); useUiStore.getState().setEditing(null); });
    await act(async () => void addFrameFor({ x: 0, y: 0 }));
    expect(st().nodes.some((n) => n.type === 'frame')).toBe(true);
  });
});

describe('draw layer (pointer input)', () => {
  const ptr = (el: Element, type: string, x: number, y: number, extra: Record<string, unknown> = {}) =>
    fireEvent(el, Object.assign(new MouseEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0 }), { pointerId: 1, pointerType: 'mouse', pressure: 0.5, ...extra }));
  it('a click with the sticky tool makes ONE sticky (a double-click does not make two) and the tool stays on', async () => {
    open();
    useUiStore.getState().setTool('sticky');
    const layer = await screen.findByTestId('draw-layer');
    await act(async () => { ptr(layer, 'pointerdown', 300, 300); ptr(layer, 'pointerup', 300, 300); });
    await act(async () => { ptr(layer, 'pointerdown', 301, 300); ptr(layer, 'pointerup', 301, 300); });
    expect(st().nodes.filter((n) => n.type === 'sticky')).toHaveLength(1);
    expect(useUiStore.getState().tool).toBe('sticky');
  });
  it('dragging with the pen leaves a stroke node and keeps the pen; the eraser removes it', async () => {
    open();
    useUiStore.getState().setTool('pen');
    const layer = await screen.findByTestId('draw-layer');
    await act(async () => {
      ptr(layer, 'pointerdown', 100, 100);
      for (let i = 1; i <= 12; i++) ptr(layer, 'pointermove', 100 + i * 12, 100 + Math.sin(i / 2) * 20);
      ptr(layer, 'pointerup', 244, 100);
    });
    const strokes = st().nodes.filter((n) => n.type === 'draw');
    expect(strokes).toHaveLength(1);
    expect(typeof strokes[0].data.pts).toBe('string');
    expect(useUiStore.getState().tool).toBe('pen');
    useUiStore.getState().setTool('eraser');
    const first = strokes[0];
    const layer2 = await screen.findByTestId('draw-layer');
    await act(async () => {
      // the jsdom flow transform is the identity: erase right on the stroke
      ptr(layer2, 'pointerdown', first.position.x + 20, first.position.y + 10);
      ptr(layer2, 'pointermove', first.position.x + 60, first.position.y + 10);
      ptr(layer2, 'pointerup', first.position.x + 60, first.position.y + 10);
    });
    expect(st().nodes.filter((n) => n.type === 'draw')).toHaveLength(0);
  });
  it('dragging with the frame tool draws a named frame and returns to select', async () => {
    open();
    useUiStore.getState().setTool('frame');
    const layer = await screen.findByTestId('draw-layer');
    await act(async () => { ptr(layer, 'pointerdown', 100, 100); ptr(layer, 'pointermove', 500, 400); ptr(layer, 'pointerup', 500, 400); });
    const f = st().nodes.find((n) => n.type === 'frame');
    expect(f).toBeTruthy();
    expect(f!.data.label).toBe('Frame 1');
    expect(useUiStore.getState().tool).toBe('select');
  });
  it('read-only viewers get no drawing layer', async () => {
    open();
    await act(async () => { useEditorSession.getState().set({ readOnly: true }); useUiStore.getState().setTool('pen'); });
    expect(screen.queryByTestId('draw-layer')).toBeNull();
    await act(async () => void useEditorSession.getState().reset());
  });
});

describe('⌘K after presenting', () => {
  it('the palette opens empty again after a command that started a presentation', async () => {
    open();
    await act(async () => {
      st().addNode(createFrame('a', { x: 0, y: 0, width: 400, height: 300 }, 'Alpha'));
    });
    const openK = () => act(async () => void fireEvent.keyDown(window, { key: 'k', metaKey: true }));
    const input = () => screen.getByLabelText('Command') as HTMLInputElement;
    await openK();
    await act(async () => void fireEvent.change(input(), { target: { value: 'Present frames' } }));
    await act(async () => void fireEvent.keyDown(input(), { key: 'Enter' }));
    await act(async () => undefined);
    expect(useBoardStore.getState().presenting).not.toBeNull();
    expect(useUiStore.getState().commandOpen).toBe(false);
    await act(async () => void fireEvent.keyDown(window, { key: 'Escape' }));
    expect(useBoardStore.getState().presenting).toBeNull();
    await openK();
    expect(input().value).toBe('');
    await act(async () => void fireEvent.change(input(), { target: { value: 'Bring everyone to me' } }));
    expect(screen.getAllByRole('option')[0].textContent).toContain('Bring everyone to me');
  });
});

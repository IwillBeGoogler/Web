import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const M = vi.hoisted(() => ({
  hasPrivate: vi.fn(() => false), reorderFrame: vi.fn(), revealAll: vi.fn(() => 3), sendReaction: vi.fn(), startPresentation: vi.fn(), zoomToFrame: vi.fn(),
}));
vi.mock('../../lib/board/actions', () => ({ hasPrivate: M.hasPrivate, reorderFrame: M.reorderFrame, revealAll: M.revealAll }));
vi.mock('../../lib/board/live', () => ({ sendReaction: M.sendReaction, startPresentation: M.startPresentation }));
vi.mock('../../hooks/useZoomToFrame', () => ({ useZoomToFrame: () => ({ zoomToFrame: M.zoomToFrame }) }));
import { QUICK_EMOJI, useBoardStore } from '../../store/boardStore';
import { useDiagramStore } from '../../store/diagramStore';
import { useToastStore } from '../../store/toastStore';
import { useUiStore } from '../../store/uiStore';
import { BoardLayer, BoardOptions, Cheatsheet, EmojiPopover, FramesPopover } from './BoardPopovers';

const frame = (id: string, label: string, order?: number) => ({ id, type: 'frame', position: { x: 0, y: 0 }, width: 100, height: 80, data: { label, ...(order !== undefined ? { order } : {}) } }) as never;
const msgs = () => useToastStore.getState().toasts.map((t) => t.message);
const tool = (t: string) => act(() => useUiStore.getState().setTool(t as never));

beforeEach(() => {
  Object.values(M).forEach((f) => f.mockClear());
  M.hasPrivate.mockReturnValue(false);
  useBoardStore.getState().reset();
  useDiagramStore.getState().reset();
  useToastStore.getState().clear();
  useUiStore.getState().setTool('select');
});

describe('BoardOptions', () => {
  it('nothing for tools without options', () => {
    const { container } = render(<BoardOptions />);
    expect(container.innerHTML).toBe('');
  });
  it('sticky: colour swatches, Name / Private toggles, Reveal all only with private stickies', () => {
    tool('sticky');
    const { rerender } = render(<BoardOptions />);
    const pink = screen.getByRole('button', { name: 'Pink' });
    expect(pink.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(pink);
    expect(useBoardStore.getState().stickyColor).toBe('pink');
    expect(screen.getByRole('button', { name: 'Pink' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(useBoardStore.getState().showAuthor).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /Private/ }));
    expect(useBoardStore.getState().privateMode).toBe(true);
    expect(screen.queryByRole('button', { name: 'Reveal all' })).toBeNull();
    M.hasPrivate.mockReturnValue(true);
    rerender(<BoardOptions />);
    fireEvent.click(screen.getByRole('button', { name: 'Reveal all' }));
    expect(M.revealAll).toHaveBeenCalled();
    expect(msgs()).toEqual(['Revealed 3 stickies']);
  });
  it('pen: brush switcher, ink swatches (auto + colours), size range, shapes toggle', () => {
    tool('pen');
    render(<BoardOptions />);
    expect(screen.getByRole('button', { name: 'Colour: automatic' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Colour #d1344a' }));
    expect(useBoardStore.getState().penColor).toBe('#d1344a');
    const range = screen.getByLabelText('Size') as HTMLInputElement;
    expect([range.min, range.max, range.value]).toEqual(['1', '16', '4']);
    fireEvent.change(range, { target: { value: '9' } });
    expect(useBoardStore.getState().penSize).toBe(9);
    fireEvent.click(screen.getByRole('button', { name: 'Shapes' }));
    expect(useBoardStore.getState().recognize).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Highlighter' }));
    expect(useUiStore.getState().tool).toBe('highlighter');
  });
  it('highlighter: its own palette, range and no Shapes chip', () => {
    tool('highlighter');
    render(<BoardOptions />);
    expect(screen.queryByRole('button', { name: 'Shapes' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Colour: automatic' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Colour #ff8fb1' }));
    expect(useBoardStore.getState().hlColor).toBe('#ff8fb1');
    const range = screen.getByLabelText('Size') as HTMLInputElement;
    expect([range.min, range.max, range.value]).toEqual(['10', '40', '20']);
    fireEvent.change(range, { target: { value: '30' } });
    expect(useBoardStore.getState().hlSize).toBe(30);
  });
  it('eraser: no colours, size range 6..40', () => {
    tool('eraser');
    render(<BoardOptions />);
    expect(screen.queryByRole('group', { name: 'Colour' })).toBeNull();
    const range = screen.getByLabelText('Size') as HTMLInputElement;
    expect([range.min, range.max, range.value]).toEqual(['6', '40', '14']);
    fireEvent.change(range, { target: { value: '25' } });
    expect(useBoardStore.getState().eraserSize).toBe(25);
    fireEvent.click(screen.getByRole('button', { name: 'Pen' }));
    expect(useUiStore.getState().tool).toBe('pen');
  });
  it('stamp: emoji buttons choose the stamp', () => {
    tool('stamp');
    render(<BoardOptions />);
    const e = QUICK_EMOJI[1];
    fireEvent.click(screen.getByRole('button', { name: `Stamp ${e}` }));
    expect(useBoardStore.getState().stampEmoji).toBe(e);
    expect(screen.getByRole('button', { name: `Stamp ${e}` }).getAttribute('aria-pressed')).toBe('true');
  });
});

describe('popovers: dismissal', () => {
  it('Escape and outside pointerdown close; inside and .dock clicks do not', () => {
    useBoardStore.getState().set({ popover: 'help' });
    const dock = document.createElement('div');
    dock.className = 'dock';
    document.body.appendChild(dock);
    render(<Cheatsheet />);
    fireEvent.keyDown(window, { key: 'a' });
    expect(useBoardStore.getState().popover).toBe('help');
    fireEvent.pointerDown(screen.getByRole('dialog'));
    fireEvent.pointerDown(dock);
    expect(useBoardStore.getState().popover).toBe('help');
    fireEvent.pointerDown(document.body);
    expect(useBoardStore.getState().popover).toBeNull();
    useBoardStore.getState().set({ popover: 'help' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(useBoardStore.getState().popover).toBeNull();
    dock.remove();
  });
  it('cheatsheet lists every shortcut group with keycaps', () => {
    render(<Cheatsheet />);
    expect(screen.getAllByRole('heading', { level: 4 }).length).toBeGreaterThan(2);
    expect(document.querySelectorAll('dt kbd').length).toBeGreaterThan(10);
  });
});

describe('EmojiPopover', () => {
  it('React sends a reaction; Stamp picks the emoji, closes and switches to the stamp tool', () => {
    useBoardStore.getState().set({ popover: 'emoji' });
    render(<EmojiPopover />);
    const e = QUICK_EMOJI[0];
    fireEvent.click(screen.getByRole('button', { name: `React ${e}` }));
    expect(M.sendReaction).toHaveBeenCalledWith(e);
    fireEvent.click(screen.getByRole('button', { name: `Stamp ${QUICK_EMOJI[2]}` }));
    expect(useBoardStore.getState().stampEmoji).toBe(QUICK_EMOJI[2]);
    expect(useBoardStore.getState().popover).toBeNull();
    expect(useUiStore.getState().tool).toBe('stamp');
  });
});

describe('FramesPopover', () => {
  it('empty: hint and disabled Present; New switches to the frame tool and closes', () => {
    useBoardStore.getState().set({ popover: 'frames' });
    render(<FramesPopover />);
    expect(screen.getByText(/No frames yet/)).toBeTruthy();
    expect((screen.getByRole('button', { name: /Present/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'New frame' }));
    expect(useUiStore.getState().tool).toBe('frame');
    expect(useBoardStore.getState().popover).toBeNull();
  });
  it('lists frames in order; rows zoom / move / copy / present; move buttons disabled at the ends', async () => {
    useDiagramStore.setState({ nodes: [frame('f1', 'One', 1), frame('f2', 'Two', 2), frame('f3', '', 3)] });
    useBoardStore.getState().set({ popover: 'frames' });
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<FramesPopover />);
    expect(screen.getAllByRole('listitem')).toHaveLength(3);
    expect((screen.getByRole('button', { name: 'Move One up' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Move Two up' }) as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Move Two up' }));
    expect(M.reorderFrame).toHaveBeenCalledWith('f2', 0);
    fireEvent.click(screen.getByRole('button', { name: 'Move Two down' }));
    expect(M.reorderFrame).toHaveBeenCalledWith('f2', 2);
    expect((screen.getByRole('button', { name: 'Move down' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'One' }));
    expect(M.zoomToFrame).toHaveBeenCalledWith('f1');
    expect(useDiagramStore.getState().nodes.find((n) => n.id === 'f1')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Frame' })).toBeTruthy(); // unnamed fallback
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Copy link to Two' })));
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('f2'));
    expect(msgs()).toContain('Link to “Two” copied');
    writeText.mockRejectedValueOnce(new Error('x'));
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Copy link to One' })));
    expect(msgs()).toContain('Could not copy the link');
    fireEvent.click(screen.getByRole('button', { name: 'Present from Two' }));
    expect(M.startPresentation).toHaveBeenCalledWith('f2');
    expect(useBoardStore.getState().popover).toBeNull();
  });
  it('header Present starts from the beginning', () => {
    useDiagramStore.setState({ nodes: [frame('f1', 'One', 1)] });
    useBoardStore.getState().set({ popover: 'frames' });
    render(<FramesPopover />);
    fireEvent.click(screen.getByRole('button', { name: /Present$/ }));
    expect(M.startPresentation).toHaveBeenCalledWith();
  });
  it('drag and drop reorders: dragging marks rows, drop calls reorderFrame, dragend clears', () => {
    useDiagramStore.setState({ nodes: [frame('f1', 'One', 1), frame('f2', 'Two', 2)] });
    render(<FramesPopover />);
    const rows = screen.getAllByRole('listitem');
    const dt = { effectAllowed: '', setData: vi.fn() };
    fireEvent.dragStart(rows[0], { dataTransfer: dt });
    expect(dt.effectAllowed).toBe('move');
    expect(dt.setData).toHaveBeenCalledWith('text/plain', 'f1');
    expect(screen.getAllByRole('listitem')[0].className).toContain('dragging');
    fireEvent.dragOver(rows[1]);
    expect(screen.getAllByRole('listitem')[1].className).toContain('over');
    fireEvent.drop(rows[1]);
    expect(M.reorderFrame).toHaveBeenCalledWith('f1', 1);
    expect(screen.getAllByRole('listitem')[0].className).not.toContain('dragging');
    // drop without an active drag does not reorder
    M.reorderFrame.mockClear();
    fireEvent.drop(rows[1]);
    expect(M.reorderFrame).not.toHaveBeenCalled();
    fireEvent.dragStart(rows[0], { dataTransfer: dt });
    fireEvent.dragEnd(rows[0]);
    expect(screen.getAllByRole('listitem')[0].className).not.toContain('dragging');
  });
});

describe('BoardLayer', () => {
  it('renders the popover chosen in the store', () => {
    const { rerender } = render(<BoardLayer />);
    expect(screen.queryByRole('dialog')).toBeNull();
    for (const [p, name] of [['emoji', 'Reactions and stamps'], ['frames', 'Frames'], ['help', 'Keyboard shortcuts']] as const) {
      act(() => useBoardStore.getState().set({ popover: p }));
      rerender(<BoardLayer />);
      expect(screen.getByRole('dialog', { name })).toBeTruthy();
    }
  });
});

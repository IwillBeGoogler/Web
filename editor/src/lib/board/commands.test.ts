import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  state: { nodes: [] as { id: string; type: string; selected?: boolean; data: Record<string, unknown> }[], updateSelectionStyle: vi.fn() },
  ui: { setTool: vi.fn() },
  board: { popover: null as string | null, privateMode: false, showAuthor: false, recognize: false, stampEmoji: '⭐', set: vi.fn() },
  toast: { info: vi.fn(), success: vi.fn(), error: vi.fn() },
  act: {
    addFrameFor: vi.fn(), arrangeSelected: vi.fn(() => 0), createMindMapAt: vi.fn(), createStickyAt: vi.fn(), mmAddChild: vi.fn(), mmAddSibling: vi.fn(),
    mmExport: vi.fn(() => '# outline'), mmImport: vi.fn((): unknown => null), mmLayoutAll: vi.fn(() => false), mmToggleCollapse: vi.fn(), revealAll: vi.fn(() => 0), stampAt: vi.fn(),
  },
  live: { bringEveryoneToMe: vi.fn(), sendReaction: vi.fn(), startPresentation: vi.fn() },
  fit: vi.fn(),
}));

vi.mock('../../store/diagramStore', () => ({ useDiagramStore: { getState: () => m.state } }));
vi.mock('../../store/uiStore', () => ({ useUiStore: { getState: () => m.ui } }));
vi.mock('../../store/boardStore', () => ({ useBoardStore: { getState: () => m.board } }));
vi.mock('../../store/toastStore', () => ({ toast: m.toast }));
vi.mock('./actions', () => m.act);
vi.mock('./live', () => m.live);
vi.mock('./flowRef', () => ({ viewCenter: () => ({ x: 5, y: 6 }), viewRect: () => ({ x: 0, y: 0, width: 1, height: 1 }), flowRef: { current: { fitBounds: m.fit } } }));

import { executeBoardAction } from './commands';

const frame = { id: 'fr', type: 'frame', selected: true, data: { label: 'F1' }, position: { x: 0, y: 0 }, width: 10, height: 10 };
const mind = { id: 'mm', type: 'mindmap', selected: true, data: {} };

beforeEach(() => {
  vi.clearAllMocks();
  m.state.nodes = [];
  m.board.popover = null;
  m.board.privateMode = false;
  m.board.recognize = false;
  m.act.arrangeSelected.mockReturnValue(0);
  m.act.revealAll.mockReturnValue(0);
  m.act.mmLayoutAll.mockReturnValue(false);
  m.act.mmImport.mockReturnValue(null);
});

describe('executeBoardAction', () => {
  it('returns false for unknown names', () => {
    expect(executeBoardAction('nope')).toBe(false);
  });

  it('simple creators use the given or the centre position', () => {
    expect(executeBoardAction('board-sticky')).toBe(true);
    expect(m.act.createStickyAt).toHaveBeenCalledWith({ x: 5, y: 6 });
    executeBoardAction('board-frame', { at: { x: 1, y: 2 } });
    expect(m.act.addFrameFor).toHaveBeenCalledWith({ x: 1, y: 2 });
    executeBoardAction('board-mindmap');
    expect(m.act.createMindMapAt).toHaveBeenCalled();
    executeBoardAction('board-stamp');
    expect(m.act.stampAt).toHaveBeenCalledWith({ x: 5, y: 6 }, '⭐');
    executeBoardAction('board-tool:pen');
    expect(m.ui.setTool).toHaveBeenCalledWith('pen');
  });

  it('toggles help, frames popover, author and recognize flags', () => {
    executeBoardAction('show-help');
    expect(m.board.set).toHaveBeenLastCalledWith({ popover: 'help' });
    m.board.popover = 'help';
    executeBoardAction('show-help');
    expect(m.board.set).toHaveBeenLastCalledWith({ popover: null });
    executeBoardAction('board-frames');
    expect(m.board.set).toHaveBeenLastCalledWith({ popover: 'frames' });
    executeBoardAction('board-author');
    expect(m.board.set).toHaveBeenLastCalledWith({ showAuthor: true });
    executeBoardAction('board-recognize');
    expect(m.board.set).toHaveBeenLastCalledWith({ recognize: true });
    expect(m.toast.info).toHaveBeenCalled();
    m.board.recognize = true;
    executeBoardAction('board-recognize');
    executeBoardAction('board-private');
    expect(m.board.set).toHaveBeenLastCalledWith({ privateMode: true });
    m.board.privateMode = true;
    executeBoardAction('board-private');
  });

  it('arrange tells what to select when nothing moved', () => {
    executeBoardAction('board-arrange:grid');
    executeBoardAction('board-arrange:color');
    expect(m.toast.info).toHaveBeenCalledTimes(2);
    m.act.arrangeSelected.mockReturnValue(3);
    executeBoardAction('board-arrange:grid');
    expect(m.toast.info).toHaveBeenCalledTimes(2);
  });

  it('reveal reports the count', () => {
    executeBoardAction('board-reveal');
    expect(m.toast.info).toHaveBeenCalledWith('Nothing is hidden');
    m.act.revealAll.mockReturnValue(1);
    executeBoardAction('board-reveal');
    expect(m.toast.success).toHaveBeenCalledWith('Revealed 1 sticky note');
    m.act.revealAll.mockReturnValue(2);
    executeBoardAction('board-reveal');
    expect(m.toast.success).toHaveBeenLastCalledWith('Revealed 2 sticky notes');
  });

  it('presents a given frame or everything', () => {
    m.state.nodes = [frame, { id: 'x', type: 'sticky', data: {} }];
    executeBoardAction('board-present', { nodeId: 'fr' });
    expect(m.live.startPresentation).toHaveBeenLastCalledWith('fr');
    executeBoardAction('board-present', { nodeId: 'x' });
    expect(m.live.startPresentation).toHaveBeenLastCalledWith(undefined);
    executeBoardAction('board-present');
    expect(m.live.startPresentation).toHaveBeenLastCalledWith(undefined);
  });

  it('copies a frame link, or asks to select a frame', async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write, readText: vi.fn() }, configurable: true });
    executeBoardAction('board-frame-link');
    expect(m.toast.info).toHaveBeenCalledWith('Select a frame first');
    m.state.nodes = [frame];
    executeBoardAction('board-frame-link');
    await vi.waitFor(() => expect(m.toast.success).toHaveBeenCalledWith('Link to “F1” copied'));
    write.mockRejectedValueOnce(new Error('denied'));
    executeBoardAction('board-frame-link', { nodeId: 'fr' });
    await vi.waitFor(() => expect(m.toast.error).toHaveBeenCalledWith('Could not use the clipboard'));
  });

  it('applies a known sticky colour only', () => {
    executeBoardAction('board-color:nonexistent');
    expect(m.state.updateSelectionStyle).not.toHaveBeenCalled();
    executeBoardAction('board-color:yellow');
    executeBoardAction('board-color:pink');
  });

  it('zooms to a frame when there is one', () => {
    executeBoardAction('board-zoom-frame');
    expect(m.fit).not.toHaveBeenCalled();
    m.state.nodes = [frame];
    executeBoardAction('board-zoom-frame');
    expect(m.fit).toHaveBeenCalled();
    executeBoardAction('board-zoom-frame', { nodeId: 'fr' });
  });

  it('summons everyone and reacts (default emoji too)', () => {
    executeBoardAction('board-summon');
    expect(m.live.bringEveryoneToMe).toHaveBeenCalled();
    executeBoardAction('board-react:🎉');
    expect(m.live.sendReaction).toHaveBeenLastCalledWith('🎉');
    executeBoardAction('board-react');
    expect(m.live.sendReaction).toHaveBeenLastCalledWith('👍');
  });

  it('mind map child, sibling and collapse need a selected node', () => {
    for (const a of ['board-mm-child', 'board-mm-sibling', 'board-mm-collapse']) executeBoardAction(a);
    expect(m.toast.info).toHaveBeenCalledTimes(3);
    m.state.nodes = [mind];
    executeBoardAction('board-mm-child');
    executeBoardAction('board-mm-sibling', { nodeId: 'mm' });
    executeBoardAction('board-mm-collapse');
    expect(m.act.mmAddChild).toHaveBeenCalledWith('mm');
    expect(m.act.mmAddSibling).toHaveBeenCalledWith('mm');
    expect(m.act.mmToggleCollapse).toHaveBeenCalledWith('mm');
  });

  it('mind map layout, export and import', async () => {
    executeBoardAction('board-mm-layout');
    expect(m.toast.info).toHaveBeenCalledWith('No mind map on this canvas');
    m.act.mmLayoutAll.mockReturnValue(true);
    executeBoardAction('board-mm-layout');

    executeBoardAction('board-mm-export');
    expect(m.toast.info).toHaveBeenCalledWith('Select a mind map node first');
    m.state.nodes = [mind];
    const write = vi.fn().mockResolvedValue(undefined);
    const read = vi.fn().mockResolvedValue('# Title\n- a');
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: write, readText: read }, configurable: true });
    executeBoardAction('board-mm-export');
    await vi.waitFor(() => expect(write).toHaveBeenCalledWith('# outline'));

    m.act.mmImport.mockReturnValue({ id: 'root' });
    executeBoardAction('board-mm-import');
    await vi.waitFor(() => expect(m.toast.success).toHaveBeenCalledWith('Mind map created from the outline on your clipboard'));
    read.mockResolvedValue('   ');
    executeBoardAction('board-mm-import');
    await vi.waitFor(() => expect(m.toast.info).toHaveBeenCalledWith(expect.stringContaining('Copy a Markdown outline')));
    read.mockRejectedValue(new Error('denied'));
    executeBoardAction('board-mm-import');
    await vi.waitFor(() => expect(m.toast.info.mock.calls.filter((c) => String(c[0]).startsWith('Copy a Markdown')).length).toBe(2));
  });
});

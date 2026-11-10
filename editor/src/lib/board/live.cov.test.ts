import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useCollabStore } from '../../collab/store';
import { useBoardStore } from '../../store/boardStore';
import { useDiagramStore } from '../../store/diagramStore';
import { toast } from '../../store/toastStore';
import { startPresentation, stopPresentation, othersInFile, bringEveryoneToMe, onReaction, sendReaction, emitRemoteReaction, cursor } from './live';
import { createFrame } from './frames';

const setPresence = vi.fn();
const withSession = () => useCollabStore.setState({ session: { setPresence } as never, people: [{ id: 'p' } as never] });

beforeEach(() => {
  vi.restoreAllMocks();
  setPresence.mockReset();
  useCollabStore.setState({ session: null, people: [] });
  useBoardStore.getState().set({ presenting: null });
  useDiagramStore.setState({ nodes: [] });
});

describe('board live', () => {
  it('startPresentation fails without frames', () => {
    const t = vi.spyOn(toast, 'info');
    expect(startPresentation()).toBe(false);
    expect(t).toHaveBeenCalled();
    expect(useBoardStore.getState().presenting).toBeNull();
  });
  it('startPresentation picks frame index', () => {
    useDiagramStore.setState({ nodes: [createFrame('f1', { x: 0, y: 0, width: 10, height: 10 }, 'A'), createFrame('f2', { x: 0, y: 500, width: 10, height: 10 }, 'B')] });
    expect(startPresentation()).toBe(true);
    expect(useBoardStore.getState().presenting?.index).toBe(0);
    startPresentation('f2');
    expect(useBoardStore.getState().presenting?.index).toBe(1);
    startPresentation('missing');
    expect(useBoardStore.getState().presenting?.index).toBe(0);
  });
  it('stopPresentation clears and notifies session', () => {
    stopPresentation();
    expect(useBoardStore.getState().presenting).toBeNull();
    withSession();
    stopPresentation();
    expect(setPresence).toHaveBeenCalledWith({ presenting: undefined, laser: undefined });
  });
  it('bringEveryoneToMe covers local, alone, sent', () => {
    expect(bringEveryoneToMe({ x: 0, y: 0, width: 1, height: 1 } as never)).toBe('local');
    useCollabStore.setState({ session: { setPresence } as never, people: [] });
    expect(othersInFile()).toBe(0);
    expect(bringEveryoneToMe({} as never)).toBe('alone');
    withSession();
    expect(othersInFile()).toBe(1);
    const r = { x: 1, y: 2, width: 3, height: 4 } as never;
    expect(bringEveryoneToMe(r)).toBe('sent');
    expect(setPresence.mock.calls[0][0].summon.rect).toBe(r);
  });
  it('reactions fire listeners and presence', () => {
    const got: unknown[] = [];
    const off = onReaction((r) => got.push(r));
    cursor.at = null;
    sendReaction('x');
    withSession();
    cursor.at = { x: 5, y: 6 };
    sendReaction('y');
    emitRemoteReaction('z', { x: 1, y: 1 });
    expect(got).toEqual([
      { emoji: 'x', at: null, mine: true },
      { emoji: 'y', at: { x: 5, y: 6 }, mine: true },
      { emoji: 'z', at: { x: 1, y: 1 }, mine: false },
    ]);
    expect(setPresence.mock.calls[0][0].reaction.at).toEqual({ x: 5, y: 6 });
    off();
    sendReaction('q');
    expect(got).toHaveLength(3);
    cursor.at = null;
    sendReaction('n');
    expect(setPresence.mock.calls.at(-1)![0].reaction.at).toEqual({ x: 0, y: 0 });
  });
});

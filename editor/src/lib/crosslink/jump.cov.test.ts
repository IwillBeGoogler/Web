import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';

const openFile = vi.fn();
const showProblem = vi.fn();
const switchPage = vi.fn();
const resolveRef = vi.fn();
let state: Record<string, unknown> = {};
vi.mock('../../workspace/actions', () => ({ openFile: (...a: unknown[]) => openFile(...a) }));
vi.mock('../smart/lintBridge', () => ({ showProblem: (...a: unknown[]) => showProblem(...a) }));
vi.mock('./projectIndex', () => ({ buildProjectIndex: () => ({ files: [] }), currentPlace: () => ({ fileId: 'f', pageId: 'p' }) }));
vi.mock('./links', () => ({ resolveRef: (...a: unknown[]) => resolveRef(...a) }));
vi.mock('../../store/diagramStore', () => ({
  useDiagramStore: Object.assign((sel: (s: unknown) => unknown) => sel(state), { getState: () => state }),
}));
const err = vi.fn();
vi.mock('../../store/toastStore', () => ({ toast: { error: (...a: unknown[]) => err(...a) } }));

import { jumpToLoc, jumpToRef, useCrossLinkJump, _pendingJump } from './jump';

beforeEach(() => { vi.useFakeTimers(); vi.clearAllMocks(); state = { projectId: 'A', activePageId: 'p1', switchPage }; });
afterEach(() => vi.useRealTimers());

describe('crosslink jump', () => {
  it('same file: switches page when different and selects node', () => {
    jumpToLoc({ fileId: 'A', pageId: 'p2', nodeId: 'n' });
    expect(switchPage).toHaveBeenCalledWith('p2');
    vi.advanceTimersByTime(40);
    expect(showProblem).toHaveBeenCalledWith(['n']);
  });
  it('same file same page does not switch', () => {
    jumpToLoc({ fileId: 'A', pageId: 'p1', nodeId: 'n' });
    expect(switchPage).not.toHaveBeenCalled();
  });
  it('other file: opens it and finishes via hook', () => {
    jumpToLoc({ fileId: 'B', pageId: 'p1', nodeId: 'n' });
    expect(openFile).toHaveBeenCalledWith('B');
    expect(_pendingJump()?.fileId).toBe('B');
    renderHook(() => useCrossLinkJump());
    expect(_pendingJump()).not.toBeNull();
    state = { ...state, projectId: 'B' };
    renderHook(() => useCrossLinkJump());
    expect(_pendingJump()).toBeNull();
    vi.advanceTimersByTime(40);
    expect(showProblem).toHaveBeenCalledWith(['n']);
    renderHook(() => useCrossLinkJump());
  });
  it('jumpToRef toasts when broken, jumps when ok', () => {
    resolveRef.mockReturnValueOnce({ ok: false, reason: 'gone' });
    expect(jumpToRef({ nodeId: 'x' })).toBe(false);
    expect(err).toHaveBeenCalledWith('Broken link: gone');
    resolveRef.mockReturnValueOnce({ ok: true, loc: { fileId: 'A', pageId: 'p1', nodeId: 'x' } });
    expect(jumpToRef({ nodeId: 'x' })).toBe(true);
    vi.advanceTimersByTime(40);
    expect(showProblem).toHaveBeenCalledWith(['x']);
  });
});

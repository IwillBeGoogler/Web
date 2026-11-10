import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  engine: null as null | { flush: ReturnType<typeof vi.fn>; baseVersion: number; applyRemote: ReturnType<typeof vi.fn> },
  api: { getFile: vi.fn(), listMembers: vi.fn(), restoreVersion: vi.fn() },
  openTimeline: vi.fn(async () => undefined),
  afterRestore: vi.fn(async () => undefined),
  setAuthors: vi.fn(),
  restoreWithConfirm: vi.fn(),
  tl: { fileId: 'f1' as string | null, preview: { version: 3 } as { version: number } | null, role: 'editor' as string },
  session: { source: 'server', role: 'editor' },
}));
vi.mock('../api/api', () => ({ api: h.api }));
vi.mock('../sync/active', () => ({ getActiveEngine: () => h.engine }));
vi.mock('../sync/status', () => ({ useEditorSession: { getState: () => h.session } }));
vi.mock('../components/sync/syncDialogs', () => ({ restoreWithConfirm: h.restoreWithConfirm }));
vi.mock('./timelineStore', () => ({
  openTimeline: h.openTimeline,
  afterRestore: h.afterRestore,
  setAuthors: h.setAuthors,
  useTimeline: { getState: () => h.tl },
}));
import { useWorkspace } from '../workspace/store';
import { useToastStore } from '../store/toastStore';
import { openTimelineFor, openTimelineForCurrent, prepareHistory, restoreShownVersion } from './timelineActions';

beforeEach(() => {
  vi.clearAllMocks();
  h.engine = null;
  h.tl = { fileId: 'f1', preview: { version: 3 }, role: 'editor' };
  h.session = { source: 'server', role: 'editor' };
  useWorkspace.setState({ projectId: null } as never);
  useToastStore.getState().clear();
});

describe('prepareHistory', () => {
  it('flushes the engine and reports its base version; restore applies remotely', async () => {
    h.engine = { flush: vi.fn(async () => undefined), baseVersion: 7, applyRemote: vi.fn() };
    const r = await prepareHistory('f1');
    expect(h.engine.flush).toHaveBeenCalled();
    expect(r.current).toBe(7);
    r.restore({ version: 8 } as never);
    expect(h.engine.applyRemote).toHaveBeenCalledWith({ version: 8 });
  });
  it('without an engine reads the server version, 0 on failure', async () => {
    h.api.getFile.mockResolvedValueOnce({ version: '5' });
    const r = await prepareHistory('f1');
    expect(r.current).toBe(5);
    expect(() => r.restore({} as never)).not.toThrow();
    h.api.getFile.mockRejectedValueOnce(new Error('x'));
    expect((await prepareHistory('f1')).current).toBe(0);
  });
});

describe('openTimelineFor', () => {
  it('opens the timeline without listing members when there is no project', async () => {
    h.api.getFile.mockResolvedValue({ version: 2 });
    await openTimelineFor('f1', 'editor');
    expect(h.openTimeline).toHaveBeenCalledWith(expect.objectContaining({ fileId: 'f1', role: 'editor', currentVersion: 2, client: h.api }));
    expect(h.api.listMembers).not.toHaveBeenCalled();
  });
  it('loads author names (name, else email) when the file is still shown', async () => {
    h.api.getFile.mockResolvedValue({ version: 2 });
    useWorkspace.setState({ projectId: 'p1' } as never);
    h.api.listMembers.mockResolvedValue([{ userId: 'u1', name: 'Ann', email: 'a@x' }, { userId: 'u2', name: '', email: 'b@x' }]);
    await openTimelineFor('f1', 'owner');
    await vi.waitFor(() => expect(h.setAuthors).toHaveBeenCalledWith({ u1: 'Ann', u2: 'b@x' }));
  });
  it('ignores authors for a different file and member-list failures', async () => {
    h.api.getFile.mockResolvedValue({ version: 2 });
    useWorkspace.setState({ projectId: 'p1' } as never);
    h.tl.fileId = 'other';
    h.api.listMembers.mockResolvedValueOnce([{ userId: 'u1', name: 'Ann', email: 'a' }]);
    await openTimelineFor('f1', 'viewer');
    await new Promise((r) => setTimeout(r, 0));
    expect(h.setAuthors).not.toHaveBeenCalled();
    h.api.listMembers.mockRejectedValueOnce(new Error('403'));
    await openTimelineFor('f1', 'viewer');
    await new Promise((r) => setTimeout(r, 0));
    expect(h.setAuthors).not.toHaveBeenCalled();
  });
});

describe('openTimelineForCurrent', () => {
  it('toasts for local files', async () => {
    h.session = { source: 'local', role: 'owner' };
    await openTimelineForCurrent();
    expect(h.openTimeline).not.toHaveBeenCalled();
    expect(useToastStore.getState().toasts.length).toBe(1);
  });
  it('opens for server files', async () => {
    h.api.getFile.mockResolvedValue({ version: 1 });
    await openTimelineForCurrent();
    expect(h.openTimeline).toHaveBeenCalledWith(expect.objectContaining({ role: 'editor' }));
  });
});

describe('restoreShownVersion', () => {
  beforeEach(() => h.api.getFile.mockResolvedValue({ version: 1 }));
  it('does nothing without file, preview, or edit right', async () => {
    h.tl.fileId = null;
    await restoreShownVersion();
    h.tl = { fileId: 'f1', preview: null, role: 'editor' };
    await restoreShownVersion();
    h.tl = { fileId: 'f1', preview: { version: 1 }, role: 'viewer' };
    await restoreShownVersion();
    expect(h.restoreWithConfirm).not.toHaveBeenCalled();
  });
  it('restores and refreshes the timeline when confirmed', async () => {
    h.restoreWithConfirm.mockResolvedValue(true);
    await restoreShownVersion();
    expect(h.restoreWithConfirm).toHaveBeenCalledWith(h.api, 'f1', 3, expect.any(Function));
    expect(h.afterRestore).toHaveBeenCalled();
  });
  it('skips refresh when declined', async () => {
    h.restoreWithConfirm.mockResolvedValue(false);
    await restoreShownVersion();
    expect(h.afterRestore).not.toHaveBeenCalled();
  });
  it('toasts the error message, or a generic one', async () => {
    h.restoreWithConfirm.mockRejectedValueOnce(new Error('boom'));
    await restoreShownVersion();
    expect(useToastStore.getState().toasts.at(-1)?.message).toBe('boom');
    h.restoreWithConfirm.mockRejectedValueOnce('str');
    await restoreShownVersion();
    expect(useToastStore.getState().toasts.at(-1)?.message).toBeTruthy();
  });
});

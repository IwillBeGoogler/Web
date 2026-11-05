import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useSession } from '../../api/session';
import { useCollabStore } from '../../collab/store';
import { useEditorSession, useSyncStore } from '../../sync/status';
import { SyncIndicator } from './SyncIndicator';

beforeEach(() => {
  useSyncStore.getState().reset();
  useEditorSession.getState().reset();
  useSession.setState({ mode: 'server', authMode: 'session', user: { id: 'u', email: 'a@b.c', name: 'A', isAdmin: false } });
  useEditorSession.getState().set({ source: 'server' });
});

describe('SyncIndicator', () => {
  it('renders nothing in local mode', () => {
    useSession.setState({ mode: 'local' });
    const { container } = render(<SyncIndicator />);
    expect(container).toBeEmptyDOMElement();
  });
  it.each([
    ['saved', {}, /Saved/],
    ['saving', {}, /Saving/],
    ['offline', { queued: 3 }, /Offline · 3 queued/],
    ['offline', { queued: 0 }, /^Offline$/],
    ['readonly', {}, /View only/],
  ] as const)('shows %s', (status, extra, text) => {
    useSyncStore.getState().set({ status, ...extra });
    render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveTextContent(text);
    expect(screen.getByRole('status')).toHaveAttribute('data-status', status);
  });
  it('conflict and error are buttons that retry', () => {
    const retry = vi.fn();
    useSyncStore.getState().set({ status: 'conflict' });
    const { rerender } = render(<SyncIndicator onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: /Conflict/ }));
    useSyncStore.getState().set({ status: 'error', message: 'boom' });
    rerender(<SyncIndicator onRetry={retry} />);
    fireEvent.click(screen.getByRole('button', { name: /Sync error/ }));
    expect(retry).toHaveBeenCalledTimes(2);
  });
  it('a local-only project offers to upload', () => {
    const up = vi.fn();
    useEditorSession.getState().set({ source: 'local' });
    render(<SyncIndicator onUpload={up} />);
    fireEvent.click(screen.getByRole('button', { name: /Local only/ }));
    expect(up).toHaveBeenCalled();
  });
  it('local-only is hidden while logged out (login is required first)', () => {
    useEditorSession.getState().set({ source: 'local' });
    useSession.setState({ user: null });
    const { container } = render(<SyncIndicator />);
    expect(container).toBeEmptyDOMElement();
  });
});

describe('SyncIndicator for a live (Yjs) file', () => {
  const live = (patch: Partial<ReturnType<typeof useCollabStore.getState>>) => {
    useSession.setState({ mode: 'server' });
    useEditorSession.setState({ source: 'server', role: 'editor', readOnly: false });
    useCollabStore.setState({ session: {} as never, status: 'connected', synced: true, readOnly: false, fatal: null, ...patch });
  };
  afterEach(() => {
    useCollabStore.setState({ session: null, status: 'off', synced: false, fatal: null, readOnly: false });
  });
  it('connected: Live; there is never a conflict or retry button', () => {
    live({});
    render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'live');
    expect(screen.getByText('Live')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('connecting before the first sync: Connecting…; after a drop: Reconnecting…', () => {
    live({ status: 'connecting', synced: false });
    const { rerender } = render(<SyncIndicator />);
    expect(screen.getByText('Connecting…')).toBeInTheDocument();
    useCollabStore.setState({ status: 'connecting', synced: true });
    rerender(<SyncIndicator />);
    expect(screen.getByText('Reconnecting…')).toBeInTheDocument();
  });
  it('offline: says edits are kept and merge later', () => {
    live({ status: 'offline', synced: true });
    render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'offline');
    expect(screen.getByRole('status')).toHaveAttribute('title', expect.stringMatching(/merge/));
  });
  it('read-only roles', () => {
    live({ readOnly: true });
    render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'readonly');
  });
  it('a deleted file is an error', () => {
    live({ fatal: 4404, status: 'offline' });
    render(<SyncIndicator />);
    expect(screen.getByRole('status')).toHaveAttribute('data-status', 'error');
  });
});

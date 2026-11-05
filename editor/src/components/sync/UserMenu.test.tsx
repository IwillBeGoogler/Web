import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { useNotificationsStore } from '../../comments/store';
import { useSession, type SessionApi } from '../../api/session';
import { UserMenu } from './UserMenu';

const fake = (): SessionApi => ({ authConfig: vi.fn(), me: vi.fn(), login: vi.fn(), register: vi.fn(), logout: vi.fn(async () => undefined) });
beforeEach(() => {
  useSession.getState().reset();
  useSession.setState({ mode: 'server', authMode: 'session', user: { id: 'u1', email: 'ada@x.io', name: 'Ada Lovelace', isAdmin: false } });
});
describe('UserMenu', () => {
  it('hidden in local mode and with AUTH_MODE=none', () => {
    useSession.setState({ mode: 'local' });
    const a = render(<UserMenu client={fake()} />);
    expect(a.container).toBeEmptyDOMElement();
    useSession.setState({ mode: 'server', authMode: 'none' });
    a.rerender(<UserMenu client={fake()} />);
    expect(a.container).toBeEmptyDOMElement();
  });
  it('shows initials, name and email; Log out clears the user and goes to /login', async () => {
    const c = fake();
    render(<UserMenu client={c} />);
    const btn = screen.getByRole('button', { name: /Account: Ada Lovelace/ });
    expect(btn).toHaveTextContent('AL');
    fireEvent.click(btn);
    expect(screen.getByText('ada@x.io')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: /Log out/ }));
    await waitFor(() => expect(window.location.pathname).toBe('/login'));
    expect(c.logout).toHaveBeenCalled();
    expect(useSession.getState().user).toBeNull();
  });
  it('anonymous visitors see a Log in button that remembers where they were', () => {
    useSession.setState({ user: null });
    window.history.replaceState({}, '', '/projects');
    render(<UserMenu client={fake()} />);
    fireEvent.click(screen.getByRole('button', { name: /Log in/ }));
    expect(window.location.pathname + window.location.search).toBe('/login?next=%2Fprojects');
  });
});

describe('UserMenu notifications', () => {
  const n = (id: string, read = false) => ({ id, kind: 'mention', projectId: 'p1', fileId: 'f9', commentId: 'c1', actor: { id: 'u2', name: 'Bob' }, text: `Bob mentioned you in ${id}`, createdAt: Date.now(), read });
  beforeEach(() => {
    useNotificationsStore.setState({ items: [n('Spec', false), n('Old', true)], unread: 1 });
    vi.spyOn(useNotificationsStore.getState(), 'load').mockResolvedValue(undefined);
  });
  it('shows an unread badge on the avatar and lists notifications in the menu', () => {
    render(<UserMenu client={fake()} />);
    expect(screen.getByTestId('notifications-badge')).toHaveTextContent('1');
    fireEvent.click(screen.getByRole('button', { name: /Account: Ada Lovelace/ }));
    const list = screen.getByRole('list', { name: 'Notifications' });
    expect(within(list).getAllByRole('menuitem')).toHaveLength(2);
    expect(within(list).getByText('Bob mentioned you in Spec').closest('button')).toHaveClass('unread');
  });
  it('clicking one marks it read and opens that file', () => {
    render(<UserMenu client={fake()} />);
    fireEvent.click(screen.getByRole('button', { name: /Account: Ada Lovelace/ }));
    fireEvent.click(screen.getByText('Bob mentioned you in Spec'));
    expect(useNotificationsStore.getState().unread).toBe(0);
    expect(window.location.pathname).toBe('/p/p1/f/f9');
  });
  it('Mark all read; an empty list says what shows up here', () => {
    render(<UserMenu client={fake()} />);
    fireEvent.click(screen.getByRole('button', { name: /Account: Ada Lovelace/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(useNotificationsStore.getState().unread).toBe(0);
    act(() => useNotificationsStore.setState({ items: [], unread: 0 }));
    expect(screen.getByText(/Mentions and replies show up here/)).toBeInTheDocument();
  });
});

import { beforeEach, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useSession } from '../../api/session';
import { usePresence, useSyncStore } from '../../sync/status';
import { PresenceAvatars } from './PresenceAvatars';

beforeEach(() => {
  useSyncStore.getState().reset();
  usePresence.getState().set([]);
  useSession.setState({ user: { id: 'u1', email: 'a@b.c', name: 'Ada Lovelace', isAdmin: false } });
});
describe('PresenceAvatars', () => {
  it('hides when only you are here', () => {
    useSyncStore.getState().set({ clientId: 'c1' });
    usePresence.getState().set([{ clientId: 'c1', userId: 'u1', name: 'Ada Lovelace', role: 'owner' }]);
    const { container } = render(<PresenceAvatars />);
    expect(container).toBeEmptyDOMElement();
  });
  it('shows initials, merges tabs of the same user and puts you first', () => {
    useSyncStore.getState().set({ clientId: 'c2' });
    usePresence.getState().set([
      { clientId: 'c9', userId: 'u2', name: 'Grace Hopper', role: 'editor' },
      { clientId: 'c2', userId: 'u1', name: 'Ada Lovelace', role: 'owner' },
      { clientId: 'c3', userId: 'u1', name: 'Ada Lovelace', role: 'owner' },
    ]);
    render(<PresenceAvatars />);
    const av = screen.getAllByTestId('presence-avatar');
    expect(av.map((a) => a.textContent)).toEqual(['AL', 'GH']);
    expect(av[0]).toHaveAttribute('title', expect.stringContaining('(you)'));
  });
  it('collapses extras into +N', () => {
    useSyncStore.getState().set({ clientId: 'c1' });
    usePresence.getState().set(Array.from({ length: 7 }, (_, i) => ({ clientId: `c${i}`, userId: `u${i + 10}`, name: `User ${i}`, role: 'viewer' })));
    render(<PresenceAvatars max={3} />);
    expect(screen.getAllByTestId('presence-avatar')).toHaveLength(3);
    expect(screen.getByText('+4')).toBeInTheDocument();
  });
});

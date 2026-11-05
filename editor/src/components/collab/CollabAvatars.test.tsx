import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSession } from '../../api/session';
import type { Collaborator } from '../../collab/presenceMath';
import { useCollabStore } from '../../collab/store';
import { usePresence } from '../../sync/status';
import { CollabAvatars } from './CollabAvatars';

const person = (id: number, name: string, extra: Partial<Collaborator['state']> = {}, status: Collaborator['status'] = 'active'): Collaborator => ({
  clientId: id,
  user: { id: `u_${name}`, name, color: '#3e63dd' },
  status,
  tabs: 1,
  state: { user: { id: `u_${name}`, name, color: '#3e63dd' }, ...extra },
});
const attach = (people: Collaborator[]) => {
  useCollabStore.setState({ session: {} as never, people, status: 'connected', synced: true, follow: { following: null }, readOnly: false });
};
beforeEach(() => {
  useCollabStore.setState({ session: null, people: [], status: 'off', follow: { following: null } });
  usePresence.getState().set([]);
  useSession.setState({ user: { id: 'u_me', email: 'm@x.y', name: 'Me Myself', isAdmin: false } });
});

describe('CollabAvatars', () => {
  it('renders nothing without a live session or when I am alone', () => {
    const { container, rerender } = render(<CollabAvatars />);
    expect(container).toBeEmptyDOMElement();
    attach([]);
    rerender(<CollabAvatars />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows everybody else in their colour with initials; idle and away people are dimmed; speaking people get a ring', () => {
    attach([person(2, 'Ann Lee', { audio: { in: true, muted: false, speaking: true } }), person(3, 'Bo Chan', {}, 'idle'), person(4, 'Cy Dee', {}, 'away')]);
    render(<CollabAvatars />);
    const av = screen.getAllByTestId('collab-avatar');
    expect(av.map((a) => a.textContent)).toEqual(['AL', 'BC', 'CD']);
    expect(av[0]).toHaveClass('speaking');
    expect(av[1]).toHaveClass('status-idle');
    expect(av[2]).toHaveClass('status-away');
    expect(av[0].style.background).toBe('rgb(62, 99, 221)');
    expect(av[1]).toHaveAttribute('title', expect.stringContaining('idle'));
  });

  it('clicking an avatar follows that person (aria-pressed); clicking again stops', () => {
    attach([person(2, 'Ann Lee', { viewport: { x: 0, y: 0, w: 100, h: 100 } })]);
    render(<CollabAvatars />);
    const btn = screen.getByRole('button', { name: 'Follow Ann Lee' });
    expect(btn).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(btn);
    expect(useCollabStore.getState().follow.following).toBe(2);
    expect(screen.getByRole('button', { name: 'Stop following Ann Lee' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'Stop following Ann Lee' }));
    expect(useCollabStore.getState().follow.following).toBeNull();
  });

  it('overflow goes to +N; the Collaborators popover lists everybody with status, role, audio and a Follow button', () => {
    usePresence.getState().set([{ clientId: 'c2', userId: 'u_Ann Lee', name: 'Ann Lee', role: 'editor' }]);
    attach([person(2, 'Ann Lee', { audio: { in: true, muted: true, speaking: false } }), person(3, 'Bo Chan', {}, 'idle'), person(4, 'Cy Dee'), person(5, 'Di Ez')]);
    render(<CollabAvatars max={2} />);
    expect(screen.getAllByTestId('collab-avatar')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Collaborators' }));
    const pop = screen.getByRole('dialog', { name: 'Collaborators' });
    expect(within(pop).getAllByRole('listitem')).toHaveLength(5); // me + 4
    expect(within(pop).getByText('Me Myself (you)')).toBeInTheDocument();
    expect(within(pop).getByText(/Ann Lee/)).toBeInTheDocument();
    expect(within(pop).getByText('Can edit')).toBeInTheDocument();
    expect(within(pop).getByText(/Muted/)).toBeInTheDocument();
    expect(within(pop).getByText(/Idle/)).toBeInTheDocument();
    fireEvent.click(within(pop).getByRole('button', { name: 'Follow Di Ez' }));
    expect(useCollabStore.getState().follow.following).toBe(5);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog', { name: 'Collaborators' })).toBeNull();
  });

  it('the followed person leaving ends the follow', () => {
    attach([person(2, 'Ann Lee')]);
    render(<CollabAvatars />);
    fireEvent.click(screen.getByRole('button', { name: 'Follow Ann Lee' }));
    expect(useCollabStore.getState().follow.following).toBe(2);
    const refresh = vi.fn();
    void refresh;
    act(() => {
      useCollabStore.setState({ people: [] });
      useCollabStore.setState({ session: { collaborators: () => [], status: 'connected', synced: true, readOnly: false } as never });
      useCollabStore.getState().refresh();
    });
    expect(useCollabStore.getState().follow.following).toBeNull();
  });
});

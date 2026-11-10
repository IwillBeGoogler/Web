import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSession } from '../../api/session';
import type { Collaborator } from '../../collab/presenceMath';
import { useCollabStore } from '../../collab/store';
import { usePresence } from '../../sync/status';
import { CollabAvatars } from './CollabAvatars';

const person = (id: number, name: string, extra: Partial<Collaborator['state']> = {}, status: Collaborator['status'] = 'active'): Collaborator => ({
  clientId: id, user: { id: `u_${name}`, name, color: '#3e63dd' }, status, tabs: 1, state: { user: { id: `u_${name}`, name, color: '#3e63dd' }, ...extra },
});
const attach = (people: Collaborator[]) => useCollabStore.setState({ session: {} as never, people, status: 'connected', synced: true, follow: { following: null }, readOnly: false });
beforeEach(() => {
  useCollabStore.setState({ session: null, people: [], status: 'off', follow: { following: null } });
  usePresence.getState().set([]);
  useSession.setState({ user: { id: 'u_me', email: 'm@x.y', name: 'Me Myself', isAdmin: false } });
});

describe('CollabAvatars extras', () => {
  it('overflow beyond max shows +N; exact fit shows an ellipsis; group label counts me', () => {
    attach([person(2, 'Ann'), person(3, 'Bo'), person(4, 'Cy')]);
    const { rerender } = render(<CollabAvatars max={2} />);
    expect(screen.getAllByTestId('collab-avatar')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Collaborators' }).textContent).toBe('+1');
    expect(screen.getByRole('group').getAttribute('aria-label')).toBe('4 people here');
    rerender(<CollabAvatars max={3} />);
    expect(screen.getByRole('button', { name: 'Collaborators' }).textContent).toBe('⋯');
  });
  it('tooltips mention audio and follow state', () => {
    attach([person(2, 'Ann', { audio: { in: true, muted: false, speaking: false } })]);
    render(<CollabAvatars />);
    expect(screen.getByTestId('collab-avatar').getAttribute('title')).toBe('Ann · active · in audio (follow)');
    fireEvent.click(screen.getByTestId('collab-avatar'));
    expect(screen.getByTestId('collab-avatar').getAttribute('title')).toContain('(stop following)');
    expect(screen.getByTestId('collab-avatar').className).toContain('following');
  });
  it('popover: me row, roles, audio states, follow buttons; closes on outside mousedown and Escape', () => {
    usePresence.getState().set([
      { clientId: 'x', userId: 'u_Ann', name: 'Ann', role: 'editor' },
      { clientId: 'y', userId: 'u_Bo', name: 'Bo', role: 'bogus' },
    ]);
    attach([
      person(2, 'Ann', { audio: { in: true, muted: true, speaking: false } }),
      person(3, 'Bo', { audio: { in: true, muted: false, speaking: true } }),
      person(4, 'Cy', { audio: { in: true, muted: false, speaking: false } }, 'idle'),
      person(5, 'Di'),
    ]);
    render(<CollabAvatars />);
    fireEvent.click(screen.getByRole('button', { name: 'Collaborators' }));
    const dlg = screen.getByRole('dialog', { name: 'Collaborators' });
    expect(within(dlg).getByText('Me Myself (you)')).toBeTruthy();
    expect(within(dlg).getByText('Can edit')).toBeTruthy();
    expect(within(dlg).queryByText('bogus')).toBeNull();
    expect(within(dlg).getByText(/In audio · Muted/)).toBeTruthy();
    expect(within(dlg).getByText(/In audio · Speaking/)).toBeTruthy();
    expect(within(dlg).getByText(/^\s*In audio\s*$/)).toBeTruthy();
    expect(dlg.querySelectorAll('.collab-audio')).toHaveLength(3);
    expect(dlg.querySelector('.status-idle')).not.toBeNull();
    const follow = within(dlg).getAllByRole('button', { name: /^Follow / });
    fireEvent.click(follow[0]);
    expect(useCollabStore.getState().follow.following).toBe(2);
    expect(within(dlg).getByRole('button', { name: 'Follow Ann' }).textContent).toBe('Following');
    expect(within(dlg).getByRole('button', { name: 'Follow Ann' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.mouseDown(dlg);
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.keyDown(window, { key: 'x' });
    expect(screen.queryByRole('dialog')).not.toBeNull();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Collaborators' }));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('signed-out me falls back to "You"', () => {
    useSession.setState({ user: null });
    attach([person(2, 'Ann')]);
    render(<CollabAvatars />);
    fireEvent.click(screen.getByRole('button', { name: 'Collaborators' }));
    expect(screen.getByText('You (you)')).toBeTruthy();
  });
});

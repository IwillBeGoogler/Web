import { act, fireEvent, render, screen } from '@testing-library/react';
import { ReactFlowProvider } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCollabStore } from '../../collab/store';
import type { Collaborator, RemoteState } from '../../collab/presenceMath';
import { usePresenterFollow } from '../../lib/board/followStore';
import { useBoardStore } from '../../store/boardStore';
import { PresenterFollow } from './PresenterFollow';

const person = (clientId: number, extra: Partial<RemoteState> = {}): Collaborator => {
  const state: RemoteState = { user: { name: 'Ann', color: '#e5484d' }, ...extra };
  return { clientId, user: state.user, status: 'active', state, tabs: 1 };
};
const rect = { x: 0, y: 0, w: 800, h: 600 };
const setPeople = (people: Collaborator[]) => act(async () => void useCollabStore.setState({ people }));
const mount = () => render(<ReactFlowProvider><PresenterFollow /></ReactFlowProvider>);

beforeEach(() => {
  useCollabStore.setState({ people: [] });
  usePresenterFollow.getState().reset();
  useBoardStore.getState().reset();
});

describe('PresenterFollow', () => {
  it('shows nothing while nobody presents', async () => {
    mount();
    await setPeople([person(2)]);
    expect(screen.queryByTestId('follow-presenter')).toBeNull();
  });
  it('follows a presenter, offers Break away, then Rejoin, and disappears when the presentation ends', async () => {
    mount();
    await setPeople([person(2, { presenting: { frameId: 'f', index: 0, rect, seq: 1 } })]);
    expect(screen.getByTestId('follow-presenter').textContent).toContain('Following Ann');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Break away' })));
    expect(screen.getByTestId('follow-presenter').textContent).toContain('Ann is presenting');
    await act(async () => void fireEvent.click(screen.getByRole('button', { name: 'Rejoin' })));
    expect(screen.getByTestId('follow-presenter').textContent).toContain('Following Ann');
    await setPeople([person(2)]);
    expect(screen.queryByTestId('follow-presenter')).toBeNull();
  });
  it('does not show the pill to the presenter himself', async () => {
    mount();
    useBoardStore.getState().set({ presenting: { index: 0, laser: false, spotlight: false } });
    await setPeople([person(2, { presenting: { frameId: 'f', index: 0, rect, seq: 1 } })]);
    expect(screen.queryByTestId('follow-presenter')).toBeNull();
  });
});

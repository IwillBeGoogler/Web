import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exec = vi.hoisted(() => vi.fn());
vi.mock('../../lib/smart/actions', () => ({ executeSmartAction: exec }));
import { useSmart } from '../../store/smartStore';
import { useWorkspace } from '../../workspace/store';
import { SimulateButton } from './SimulateButton';

beforeEach(() => { exec.mockClear(); useSmart.setState({ simulating: false }); });

describe('SimulateButton', () => {
  it('idle: Start label, not pressed, click toggles simulation', () => {
    render(<SimulateButton />);
    const b = screen.getByTestId('sim-btn');
    expect(b.textContent).toContain('Start simulation');
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.className).not.toContain('running');
    fireEvent.click(b);
    expect(exec).toHaveBeenCalledWith('simulate-toggle');
  });
  it('running: Stop label, pressed', () => {
    render(<SimulateButton />);
    act(() => useSmart.setState({ simulating: true }));
    const b = screen.getByTestId('sim-btn');
    expect(b.textContent).toContain('Stop simulation');
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.className).toContain('running');
  });
  it('only system design files get it: ER / UML / board files do not, unknown files keep it', () => {
    const file = (id: string, kind: 'sdd' | 'erd' | 'uml' | 'board') => ({ id, folderId: null, name: id, kind, position: 0, createdAt: 0, updatedAt: 0, pageCount: 1 });
    useWorkspace.setState({ tree: { folders: [], files: [file('s', 'sdd'), file('e', 'erd'), file('u', 'uml'), file('b', 'board')] } });
    for (const [id, shown] of [['s', true], ['e', false], ['u', false], ['b', false], ['other', true]] as const) {
      const { unmount } = render(<SimulateButton fileId={id} />);
      expect(!!screen.queryByTestId('sim-btn')).toBe(shown);
      unmount();
    }
  });
});

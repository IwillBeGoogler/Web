import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const exec = vi.hoisted(() => vi.fn());
vi.mock('../../lib/smart/actions', () => ({ executeSmartAction: exec }));
import { useSmart } from '../../store/smartStore';
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
});

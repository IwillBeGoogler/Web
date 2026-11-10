import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { Toggle } from './Toggle';

describe('Toggle', () => {
  it('is a switch that reports the new checked state', () => {
    const onChange = vi.fn();
    render(<Toggle checked={false} onChange={onChange} label="Snap" hint="Snap to grid" />);
    const sw = screen.getByRole('switch', { name: 'Snap' });
    expect(sw).not.toBeChecked();
    expect(sw).toHaveAccessibleDescription('Snap to grid');
    fireEvent.click(sw);
    expect(onChange).toHaveBeenCalledWith(true);
  });
  it('mixed shows tag, aria-checked mixed, unchecked', () => {
    const { container } = render(<Toggle checked mixed onChange={() => {}} label="Snap" />);
    const sw = screen.getByRole('switch');
    expect(sw).toHaveAttribute('aria-checked', 'mixed');
    expect(sw).not.toBeChecked();
    expect(screen.getByText('Mixed')).toBeInTheDocument();
    expect(container.querySelector('label')).toHaveClass('is-mixed');
    expect(sw).not.toHaveAttribute('aria-describedby');
  });
  it('disabled blocks interaction', () => {
    const { container } = render(<Toggle checked onChange={() => {}} label="Snap" disabled />);
    expect(screen.getByRole('switch')).toBeDisabled();
    expect(container.querySelector('label')).toHaveClass('is-disabled');
  });
});

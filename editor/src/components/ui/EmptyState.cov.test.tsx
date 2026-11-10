import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders title, hint and action', () => {
    const { container } = render(<EmptyState title="Nothing here" hint="Add something" action={<button>Go</button>} />);
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.getByText('Add something')).toHaveClass('muted');
    expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
  });
  it('omits the hint paragraph when absent', () => {
    const { container } = render(<EmptyState title="Empty" />);
    expect(container.querySelector('p')).toBeNull();
    expect(container.querySelector('button')).toBeNull();
  });
});

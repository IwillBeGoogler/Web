import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HomeLink } from './HomeLink';
import { setLeaveGuard } from '../../lib/router';

let off: (() => void) | null = null;
afterEach(() => {
  off?.();
  off = null;
  document.querySelector('.landing')?.remove();
});

describe('HomeLink', () => {
  it('is a link to / with logo-only label by default and wordmark label otherwise', () => {
    const { rerender } = render(<HomeLink className="x" />);
    const a = screen.getByRole('link', { name: 'Home' });
    expect(a).toHaveAttribute('href', '/');
    expect(a).toHaveClass('home-link', 'x');
    expect(a.querySelector('.wordmark')).toBeNull();
    rerender(<HomeLink wordmark />);
    expect(screen.getByRole('link', { name: 'System Design Diagram, home' }).querySelector('.wordmark')).toBeInTheDocument();
  });
  it('navigates to / via SPA and runs beforeNavigate', () => {
    window.history.replaceState({}, '', '/projects');
    const before = vi.fn();
    render(<HomeLink beforeNavigate={before} />);
    fireEvent.click(screen.getByRole('link'));
    expect(before).toHaveBeenCalledOnce();
    expect(window.location.pathname).toBe('/');
  });
  it('scrolls the landing to top when already on /', () => {
    window.history.replaceState({}, '', '/');
    const landing = document.createElement('div');
    landing.className = 'landing';
    const scrollTo = vi.fn();
    landing.scrollTo = scrollTo as never;
    document.body.appendChild(landing);
    render(<HomeLink />);
    fireEvent.click(screen.getByRole('link'));
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' });
  });
  it('does not intercept modified or non-primary clicks', () => {
    window.history.replaceState({}, '', '/projects');
    render(<HomeLink />);
    const a = screen.getByRole('link');
    fireEvent.click(a, { metaKey: true });
    fireEvent.click(a, { ctrlKey: true });
    fireEvent.click(a, { shiftKey: true });
    fireEvent.click(a, { altKey: true });
    fireEvent.click(a, { button: 1 });
    expect(window.location.pathname).toBe('/projects');
  });
  it('asks before leaving when guard needs it: yes navigates, no stays', async () => {
    window.history.replaceState({}, '', '/projects');
    let answer = false;
    off = setLeaveGuard({ needed: () => true, ask: () => Promise.resolve(answer) } as never);
    render(<HomeLink />);
    fireEvent.click(screen.getByRole('link'));
    await new Promise((r) => setTimeout(r, 0));
    expect(window.location.pathname).toBe('/projects');
    answer = true;
    fireEvent.click(screen.getByRole('link'));
    await waitFor(() => expect(window.location.pathname).toBe('/'));
  });
});

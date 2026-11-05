import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TooltipLayer, useTip } from './Tooltip';
import { useTipStore } from '../store/tipStore';

function Item({ truncated = false }: { truncated?: boolean }) {
  const tip = useTip({ title: 'Amazon Elastic Kubernetes Service', path: 'AWS › Containers', aliases: ['eks', 'k8s'] }, { onlyWhenTruncated: truncated });
  return <button {...tip}>EKS</button>;
}

beforeEach(() => {
  vi.useFakeTimers();
  useTipStore.getState().hide();
});
afterEach(() => vi.useRealTimers());

describe('tooltip', () => {
  it('shows full name, category path and aliases after the delay, in a portal', () => {
    render(<><Item /><TooltipLayer /></>);
    fireEvent.mouseEnter(screen.getByText('EKS'));
    expect(screen.queryByRole('tooltip')).toBeNull(); // not before 300ms
    act(() => void vi.advanceTimersByTime(299));
    expect(screen.queryByRole('tooltip')).toBeNull();
    act(() => void vi.advanceTimersByTime(2));
    const tip = screen.getByRole('tooltip');
    expect(tip).toHaveTextContent('Amazon Elastic Kubernetes Service');
    expect(tip).toHaveTextContent('AWS › Containers');
    expect(tip).toHaveTextContent('aka: eks, k8s');
    expect(tip.parentElement).toBe(document.body); // portal: never clipped by overflow containers
  });
  it('hides on mouse leave and cancels a pending show', () => {
    render(<><Item /><TooltipLayer /></>);
    fireEvent.mouseEnter(screen.getByText('EKS'));
    act(() => void vi.advanceTimersByTime(350));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.mouseLeave(screen.getByText('EKS'));
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('EKS'));
    fireEvent.mouseLeave(screen.getByText('EKS'));
    act(() => void vi.advanceTimersByTime(500));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('shows on keyboard focus and hides on blur', () => {
    render(<><Item /><TooltipLayer /></>);
    fireEvent.focus(screen.getByText('EKS'));
    act(() => void vi.advanceTimersByTime(350));
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    fireEvent.blur(screen.getByText('EKS'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('hides on scroll and on drag start', () => {
    render(<><Item /><TooltipLayer /></>);
    fireEvent.mouseEnter(screen.getByText('EKS'));
    act(() => void vi.advanceTimersByTime(350));
    fireEvent.scroll(window);
    expect(screen.queryByRole('tooltip')).toBeNull();
    fireEvent.mouseEnter(screen.getByText('EKS'));
    act(() => void vi.advanceTimersByTime(350));
    fireEvent.dragStart(screen.getByText('EKS'));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
  it('onlyWhenTruncated: no tooltip for text that fits', () => {
    render(<><Item truncated /><TooltipLayer /></>);
    fireEvent.mouseEnter(screen.getByText('EKS')); // jsdom: scrollWidth === clientWidth === 0
    act(() => void vi.advanceTimersByTime(350));
    expect(screen.queryByRole('tooltip')).toBeNull();
  });
});

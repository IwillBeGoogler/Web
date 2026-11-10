import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { ToastLayer } from './ToastLayer';
import { toast, useToastStore } from '../../store/toastStore';

afterEach(() => act(() => useToastStore.getState().clear()));

describe('ToastLayer', () => {
  it('renders toasts by kind with roles and dismisses on click', () => {
    render(<ToastLayer />);
    expect(screen.getByRole('region', { name: 'Notifications' })).toBeInTheDocument();
    act(() => {
      toast.error('boom');
      toast.success('yay');
      toast.info('fyi');
    });
    expect(screen.getByRole('alert')).toHaveTextContent('boom');
    expect(screen.getAllByRole('status')).toHaveLength(2);
    expect(screen.getByText('boom').closest('.toast')).toHaveClass('toast-error');
    fireEvent.click(screen.getAllByRole('button', { name: 'Dismiss notification' })[0]);
    expect(useToastStore.getState().toasts.map((x) => x.message)).toEqual(['yay', 'fyi']);
  });
});

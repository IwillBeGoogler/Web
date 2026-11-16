import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { usePaneDismiss } from './usePaneDismiss';

function Probe({ open, close }: { open: boolean; close: () => void }) {
  usePaneDismiss(open, close);
  return (
    <div>
      <div className="react-flow__pane" data-testid="pane"><span data-testid="inside-pane" /></div>
      <div className="react-flow__node" data-testid="node" />
    </div>
  );
}

describe('usePaneDismiss', () => {
  it('a press on the empty canvas closes an open panel; nodes and closed panels do not', () => {
    const close = vi.fn();
    const { getByTestId, rerender } = render(<Probe open close={close} />);
    fireEvent.pointerDown(getByTestId('node'));
    expect(close).not.toHaveBeenCalled();
    fireEvent.pointerDown(getByTestId('inside-pane'));
    expect(close).toHaveBeenCalledTimes(1);
    rerender(<Probe open={false} close={close} />);
    fireEvent.pointerDown(getByTestId('pane'));
    expect(close).toHaveBeenCalledTimes(1);
  });
});

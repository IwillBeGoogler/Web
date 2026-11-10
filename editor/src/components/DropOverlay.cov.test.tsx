import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const openBytes = vi.hoisted(() => vi.fn().mockResolvedValue('opened'));
vi.mock('../hooks/useSdd', () => ({ useSddActions: () => ({ openBytes }) }));

import { DropOverlay } from './DropOverlay';
import { useToastStore } from '../store/toastStore';

function drag(type: string, opts: { files?: File[]; types?: string[] } = {}) {
  const e = new Event(type, { bubbles: true, cancelable: true }) as Event & { dataTransfer: unknown };
  e.dataTransfer = { types: opts.types ?? ['Files'], files: opts.files ?? [] };
  act(() => void window.dispatchEvent(e));
  return e;
}

beforeEach(() => vi.clearAllMocks());

describe('DropOverlay', () => {
  it('shows on file drag enter and hides after balanced leaves', async () => {
    render(<DropOverlay />);
    expect(screen.queryByTestId('drop-overlay')).toBeNull();
    drag('dragenter');
    drag('dragenter');
    expect(screen.getByTestId('drop-overlay')).toHaveTextContent('Drop to open');
    drag('dragleave');
    expect(screen.getByTestId('drop-overlay')).toBeInTheDocument();
    drag('dragleave');
    await vi.waitFor(() => expect(screen.queryByTestId('drop-overlay')).toBeNull());
  });
  it('ignores non-file drags', () => {
    render(<DropOverlay />);
    drag('dragenter', { types: ['text/plain'] });
    drag('dragleave', { types: ['text/plain'] });
    const over = drag('dragover', { types: ['text/plain'] });
    expect(over.defaultPrevented).toBe(false);
    const d = drag('drop', { types: ['text/plain'] });
    expect(d.defaultPrevented).toBe(false);
    expect(screen.queryByTestId('drop-overlay')).toBeNull();
  });
  it('dragover with files is prevented', () => {
    render(<DropOverlay />);
    expect(drag('dragover').defaultPrevented).toBe(true);
  });
  it('drop of .sdd opens its bytes', async () => {
    render(<DropOverlay />);
    drag('dragenter');
    const f = new File([new Uint8Array([1, 2, 3])], 'a.SDD');
    const e = drag('drop', { files: [new File(['x'], 'n.txt'), f] });
    expect(e.defaultPrevented).toBe(true);
    await vi.waitFor(() => expect(openBytes).toHaveBeenCalled());
    expect(openBytes.mock.calls[0][1]).toBe('a.SDD');
    expect(Array.from(openBytes.mock.calls[0][0] as Uint8Array)).toEqual([1, 2, 3]);
  });
  it('drop of other file toasts error', () => {
    render(<DropOverlay />);
    drag('drop', { files: [new File(['x'], 'n.txt')] });
    expect(openBytes).not.toHaveBeenCalled();
    expect(JSON.stringify(useToastStore.getState())).toContain('Drop a .sdd file');
  });
  it('drop with Files type but no files list toasts error', () => {
    render(<DropOverlay />);
    const e = new Event('drop', { cancelable: true }) as Event & { dataTransfer: unknown };
    e.dataTransfer = { types: ['Files'] };
    act(() => void window.dispatchEvent(e));
    expect(openBytes).not.toHaveBeenCalled();
    expect(JSON.stringify(useToastStore.getState().toasts)).toContain('Drop a .sdd file');
  });
  it('leave with unbalanced depth keeps overlay until last leave', async () => {
    render(<DropOverlay />);
    drag('dragenter');
    drag('dragenter');
    drag('dragenter');
    drag('dragleave');
    expect(screen.getByTestId('drop-overlay')).toBeInTheDocument();
    drag('dragleave');
    drag('dragleave');
    await vi.waitFor(() => expect(screen.queryByTestId('drop-overlay')).toBeNull());
  });
  it('events without dataTransfer are ignored', () => {
    render(<DropOverlay />);
    const e = new Event('dragover', { cancelable: true });
    act(() => void window.dispatchEvent(e));
    expect(e.defaultPrevented).toBe(false);
  });
});

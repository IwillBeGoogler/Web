import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { createElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ custom: vi.fn(), list: vi.fn(), load: vi.fn(), cmp: vi.fn() }));
vi.mock('../../lib/dialogs', () => ({ dialogs: { custom: h.custom } }));
vi.mock('../../lib/smart/review', () => ({ listCompareTargets: h.list, loadBaseline: h.load, compareWithCurrent: h.cmp }));
import { useDiffStore } from '../../versions/diffStore';
import { useSmart } from '../../store/smartStore';
import { useToastStore } from '../../store/toastStore';
import { openCompare } from './ReviewCompare';

const msgs = () => useToastStore.getState().toasts.map((t) => t.message);
const target = { kind: 'file', id: 'f1', name: 'Other file' };
beforeEach(() => {
  Object.values(h).forEach((m) => m.mockReset());
  useDiffStore.getState().clear();
  useSmart.setState({ diff: false });
  useToastStore.getState().clear();
});

describe('openCompare', () => {
  it('cancelled picker does nothing', async () => {
    h.custom.mockResolvedValue(null);
    await openCompare();
    expect(h.load).not.toHaveBeenCalled();
    expect(useDiffStore.getState().diff).toBeNull();
  });
  it('shows diff, opens review; "No differences" toast only when empty', async () => {
    h.custom.mockResolvedValue(target);
    h.load.mockResolvedValue({});
    h.cmp.mockReturnValue({ isEmpty: false, nodes: { added: [], removed: [], changed: [] }, edges: { added: [], removed: [], changed: [] }, nameChanged: null });
    await openCompare();
    expect(useDiffStore.getState().from).toBe('Other file');
    expect(useDiffStore.getState().to).toBe('Current');
    expect(useSmart.getState().diff).toBe(true);
    expect(msgs()).toEqual([]);
    h.cmp.mockReturnValue({ isEmpty: true, nodes: { added: [], removed: [], changed: [] }, edges: { added: [], removed: [], changed: [] }, nameChanged: null });
    await openCompare();
    expect(msgs()).toEqual(['No differences']);
  });
  it('load failure -> error toast with Error message or stringified value', async () => {
    h.custom.mockResolvedValue(target);
    h.load.mockRejectedValueOnce(new Error('boom')).mockRejectedValueOnce('str');
    await openCompare();
    await openCompare();
    expect(msgs()).toEqual(['Could not compare: boom', 'Could not compare: str']);
  });
});

describe('ComparePicker', () => {
  const picker = async () => {
    h.custom.mockResolvedValue(null);
    await openCompare();
    const opts = h.custom.mock.calls[0][0];
    const done = vi.fn(), cancel = vi.fn();
    render(createElement(() => opts.render({ done, cancel })));
    return { done, cancel, opts };
  };
  it('loading then lists files and versions; Compare resolves target; Cancel cancels', async () => {
    let res!: (v: unknown) => void;
    h.list.mockReturnValue(new Promise((r) => { res = r; }));
    const { done, cancel, opts } = await picker();
    expect(opts.title).toBe('Compare with…');
    expect(screen.getByText('Loading…')).toBeTruthy();
    await act(async () => res([target, { kind: 'version', id: 'v', name: 'v2' }]));
    const items = screen.getAllByRole('listitem');
    expect(items[1].textContent).toContain('⏱ v2');
    expect(items[0].textContent).not.toContain('⏱');
    fireEvent.click(screen.getAllByRole('button', { name: 'Compare' })[0]);
    expect(done).toHaveBeenCalledWith(target);
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(cancel).toHaveBeenCalled();
  });
  it('empty targets show hint', async () => {
    h.list.mockResolvedValue([]);
    await picker();
    await waitFor(() => expect(screen.getByText(/nothing to compare with yet/)).toBeTruthy());
  });
});

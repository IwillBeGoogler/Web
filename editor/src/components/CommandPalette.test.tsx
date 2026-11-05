import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import App from '../App';
import { useDiagramStore } from '../store/diagramStore';
import { useUiStore } from '../store/uiStore';
import { createStoredProject } from '../lib/projects';
import { useTimeline } from '../versions/timelineStore';

beforeEach(() => {
  localStorage.clear();
  useDiagramStore.getState().reset();
  useUiStore.getState().resetUi();
  const p = createStoredProject(localStorage, 'Cmd');
  render(<App initialProjectId={p.id} />);
});
const openK = () => act(async () => void fireEvent.keyDown(window, { key: 'k', metaKey: true }));
const input = () => screen.getByLabelText('Command') as HTMLInputElement;

describe('⌘K command palette', () => {
  it('opens with ⌘K, focuses the input and closes with Esc / ⌘K', async () => {
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
    await openK();
    expect(screen.getByRole('dialog', { name: 'Command palette' })).toBeTruthy();
    expect(document.activeElement).toBe(input());
    await act(async () => void fireEvent.keyDown(input(), { key: 'Escape' }));
    expect(useUiStore.getState().commandOpen).toBe(false);
    await openK();
    await openK();
    expect(useUiStore.getState().commandOpen).toBe(false);
  });
  it('filters, navigates with arrows and runs a command with Enter', async () => {
    await openK();
    await act(async () => void fireEvent.change(input(), { target: { value: 'minimap' } }));
    const opts = screen.getAllByRole('option');
    expect(opts[0].textContent).toContain('Toggle minimap');
    expect(useUiStore.getState().showMinimap).toBe(false);
    await act(async () => void fireEvent.keyDown(input(), { key: 'Enter' }));
    await act(async () => undefined);
    expect(useUiStore.getState().showMinimap).toBe(true);
    expect(useUiStore.getState().commandOpen).toBe(false);
  });
  it('arrow keys move the active option', async () => {
    await openK();
    const first = screen.getAllByRole('option')[0];
    expect(first.getAttribute('aria-selected')).toBe('true');
    await act(async () => void fireEvent.keyDown(input(), { key: 'ArrowDown' }));
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
    await act(async () => void fireEvent.keyDown(input(), { key: 'ArrowUp' }));
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');
  });
  it('adds a component by name and starts label edit', async () => {
    await openK();
    await act(async () => void fireEvent.change(input(), { target: { value: 'postgres' } }));
    const add = screen.getAllByRole('option').find((o) => /Add PostgreSQL/.test(o.textContent ?? ''));
    expect(add).toBeTruthy();
    await act(async () => void fireEvent.mouseDown(add!));
    await act(async () => undefined);
    const n = useDiagramStore.getState().nodes;
    expect(n).toHaveLength(1);
    expect(n[0].data.label).toBe('PostgreSQL');
    expect(useUiStore.getState().editingId).toBe(n[0].id);
  });
  it('offers no "Add <component>" while a past version is previewed (the node would land in the hidden live document)', async () => {
    useTimeline.setState({ open: true, preview: { version: 1, nodes: [], edges: [] } });
    try {
      await openK();
      await act(async () => void fireEvent.change(input(), { target: { value: 'postgres' } }));
      expect(screen.queryAllByRole('option').some((o) => /Add PostgreSQL/.test(o.textContent ?? ''))).toBe(false);
    } finally {
      useTimeline.setState({ open: false, preview: null });
    }
  });
  it('inserts a template into the page', async () => {
    await openK();
    await act(async () => void fireEvent.change(input(), { target: { value: 'insert template medium' } }));
    await act(async () => void fireEvent.keyDown(input(), { key: 'Enter' }));
    await act(async () => undefined);
    expect(useDiagramStore.getState().nodes.length).toBeGreaterThan(50);
  });
  it('shows an empty state for nonsense', async () => {
    await openK();
    await act(async () => void fireEvent.change(input(), { target: { value: 'qqqzzzxxx' } }));
    expect(screen.getByText('No matching commands')).toBeTruthy();
  });
});

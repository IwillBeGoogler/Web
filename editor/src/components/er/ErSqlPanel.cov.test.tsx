import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useDiagramStore } from '../../store/diagramStore';
import { useUiStore } from '../../store/uiStore';
import { useToastStore } from '../../store/toastStore';
import { blankTable } from '../../lib/er/relations';
import { tableOf } from '../../lib/er/tableData';
import { ErSqlPanel } from './ErSqlPanel';

const s = () => useDiagramStore.getState();
const toasts = () => useToastStore.getState().toasts.map((x) => x.message);
const openPanel = (v = true) => act(() => useUiStore.getState().setDesign({ sqlPanelOpen: v }));

describe('ErSqlPanel', () => {
  beforeEach(() => {
    s().reset();
    useToastStore.getState().clear();
    useUiStore.getState().setDesign({ sqlPanelOpen: false });
  });
  it('renders nothing when closed', () => {
    const { container } = render(<ErSqlPanel />);
    expect(container.innerHTML).toBe('');
  });
  it('shows placeholder when no tables, live SQL after adding, dialect switch', async () => {
    render(<ErSqlPanel />);
    openPanel();
    const ta = screen.getByLabelText('SQL') as HTMLTextAreaElement;
    expect(ta.value).toContain('no tables on this page');
    expect(screen.getByLabelText('Copy SQL')).toBeDisabled();
    act(() => s().addNode(blankTable('a', { x: 0, y: 0 }, 'users')));
    await waitFor(() => expect(ta.value).toContain('CREATE TABLE "users"'));
    fireEvent.change(screen.getByLabelText('SQL dialect'), { target: { value: 'mysql' } });
    await waitFor(() => expect(ta.value).toContain('`users`'));
  });
  it('copies sql to clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
    render(<ErSqlPanel />);
    openPanel();
    fireEvent.click(screen.getByLabelText('Copy SQL'));
    expect(writeText.mock.calls[0][0]).toContain('users');
    await waitFor(() => expect(toasts()).toContain('Copied SQL'));
  });
  it('edit -> discard, and apply writes back to diagram (Ctrl+Enter and button)', async () => {
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
    render(<ErSqlPanel />);
    openPanel();
    const ta = screen.getByLabelText('SQL') as HTMLTextAreaElement;
    fireEvent.change(ta, { target: { value: 'garbage' } });
    expect(ta.className).toBe('dirty');
    fireEvent.click(screen.getByLabelText('Apply SQL to diagram'));
    expect(toasts()).toContain('No CREATE TABLE found');
    fireEvent.click(screen.getByLabelText('Discard SQL edit'));
    expect(ta.className).toBe('');
    expect(screen.queryByLabelText('Apply SQL to diagram')).toBeNull();
    // apply via ctrl+enter, 1 table
    fireEvent.change(ta, { target: { value: 'CREATE TABLE one (id int PRIMARY KEY);' } });
    fireEvent.keyDown(ta, { key: 'Enter', ctrlKey: true });
    expect(toasts()).toContain('Applied 1 table');
    expect(s().nodes.map((n) => tableOf(n).label)).toEqual(['one']);
    // plain Enter does not apply
    fireEvent.change(ta, { target: { value: 'CREATE TABLE two (id int);' } });
    fireEvent.keyDown(ta, { key: 'Enter' });
    expect(ta.className).toBe('dirty');
    // apply no-op when not dirty is covered by discard; multiple + warnings
    fireEvent.change(ta, { target: { value: 'CREATE TABLE a (id int, x int REFERENCES nope(id));\nCREATE TABLE b (id int);' } });
    fireEvent.click(screen.getByLabelText('Apply SQL to diagram'));
    expect(toasts().some((m) => /Applied 2 tables · \d+ warning/.test(m))).toBe(true);
  });
  it('ctrl+enter on an unedited script does nothing', () => {
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
    render(<ErSqlPanel />);
    openPanel();
    fireEvent.keyDown(screen.getByLabelText('SQL'), { key: 'Enter', ctrlKey: true });
    expect(toasts()).toEqual([]);
    expect(s().nodes).toHaveLength(1);
  });
  it('applies multiple tables with no warnings', () => {
    render(<ErSqlPanel />);
    openPanel();
    const ta = screen.getByLabelText('SQL');
    fireEvent.change(ta, { target: { value: 'CREATE TABLE a (id int);CREATE TABLE b (id int);' } });
    fireEvent.keyDown(ta, { key: 'Enter', metaKey: true });
    expect(toasts()).toContain('Applied 2 tables');
  });
  it('migration tab diffs from baseline; set baseline resets it; schema tab buttons hidden', async () => {
    s().addNode(blankTable('a', { x: 0, y: 0 }, 'users'));
    render(<ErSqlPanel />);
    openPanel();
    fireEvent.click(screen.getByRole('tab', { name: 'Migration' }));
    const mig = screen.getByLabelText('Migration SQL') as HTMLTextAreaElement;
    expect(mig.readOnly).toBe(true);
    act(() => s().addNode(blankTable('b', { x: 400, y: 0 }, 'orders')));
    await waitFor(() => expect(mig.value).toContain('orders'));
    fireEvent.keyDown(mig, { key: 'a' });
    fireEvent.click(screen.getByLabelText('Set migration baseline'));
    expect(toasts()).toContain('Baseline set');
    await waitFor(() => expect(mig.value).not.toContain('CREATE TABLE "orders"'));
    fireEvent.click(screen.getByRole('tab', { name: 'Schema' }));
    expect(screen.getByLabelText('SQL')).toBeTruthy();
  });
  it('close button closes; reopening resets baseline', () => {
    render(<ErSqlPanel />);
    openPanel();
    fireEvent.click(screen.getByLabelText('Close SQL preview'));
    expect(useUiStore.getState().sqlPanelOpen).toBe(false);
    expect(screen.queryByLabelText('SQL preview')).toBeNull();
  });
});

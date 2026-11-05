import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { LINT_RULES } from '@core/lint';
import { LINT_RULES_META } from '../../lib/smart/lintMeta';
import { applyFixToStore } from '../../lib/smart/lintBridge';
import { applyText } from '../../lib/dsl/bridge';
import { useDiagramStore } from '../../store/diagramStore';
import { useLintStore } from '../../store/lintStore';
import { useSmart } from '../../store/smartStore';
import { PaletteRail } from '../PaletteRail';
import { LintSettings } from './LintSettings';
import { ProblemsPanel } from './ProblemsPanel';

const s = () => useDiagramStore.getState();
beforeEach(() => {
  s().reset();
  useSmart.getState().reset();
  useLintStore.getState().reset();
  applyText('#!sdd 1\nnode u "User" icon=user\nnode api "API" icon=service\nu -> api\n');
});

describe('rule metadata for the UI', () => {
  it('matches the linter (ids, categories, default severities)', () => {
    expect(LINT_RULES_META.map((r) => [r.id, r.category, r.severity])).toEqual(LINT_RULES.map((r) => [r.id, r.category, r.severity]));
  });
});

describe('rail badge and Problems popover', () => {
  it('the badge shows the count only when there are problems', async () => {
    render(<PaletteRail />);
    await waitFor(() => expect(screen.getByTestId('problems-badge')).toBeInTheDocument(), { timeout: 3000 });
    expect(Number(screen.getByTestId('problems-badge').textContent)).toBeGreaterThan(0);
  });
  it('no problems, no badge and no button', async () => {
    s().reset();
    render(<PaletteRail />);
    await new Promise((r) => setTimeout(r, 600));
    expect(screen.queryByTestId('problems-badge')).toBeNull();
    expect(screen.queryByRole('button', { name: /Problems/ })).toBeNull();
  });
  it('the panel is closed by default, lists problems, selects the nodes on click', async () => {
    const { rerender } = render(<ProblemsPanel />);
    expect(screen.queryByTestId('problems-panel')).toBeNull();
    act(() => useSmart.getState().setProblems(true));
    rerender(<ProblemsPanel />);
    const row = await screen.findByText(/talks directly to/, undefined, { timeout: 3000 });
    fireEvent.click(row);
    expect(s().nodes.filter((n) => n.selected).map((n) => n.id).sort()).toEqual(['api', 'u']);
  });
  it('quick fix: add the missing index in one undo step', async () => {
    s().reset();
    applyText('#!sdd 1\ntable users {\n id uuid [pk]\n}\ntable orders {\n id uuid [pk]\n user_id uuid [not null, ref: > users.id]\n}\n');
    act(() => useSmart.getState().setProblems(true));
    render(<ProblemsPanel />);
    const fix = await screen.findByRole('button', { name: /Fix/ }, { timeout: 3000 });
    fireEvent.click(fix);
    const orders = s().nodes.find((n) => n.data.label === 'orders')!;
    expect((orders.data as unknown as { indexes: unknown[] }).indexes).toHaveLength(1);
    s().undo();
    expect((s().nodes.find((n) => n.data.label === 'orders')!.data as unknown as { indexes: unknown[] }).indexes).toHaveLength(0);
  });
  it('applyFixToStore: add a primary key', () => {
    s().reset();
    applyText('#!sdd 1\ntable log {\n msg text\n}\n');
    const ok = applyFixToStore({ kind: 'add-pk', label: 'x', nodeId: s().nodes[0].id });
    expect(ok).toBe(true);
    expect((s().nodes[0].data as unknown as { columns: { pk: boolean }[] }).columns[0].pk).toBe(true);
  });
});

describe('lint settings', () => {
  it('disable a rule and change severity; persisted', () => {
    render(<LintSettings />);
    fireEvent.click(screen.getByLabelText('Enable Table without a primary key'));
    expect(useLintStore.getState().config.rules!['erd/no-pk'].enabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Severity of Foreign key without an index'), { target: { value: 'error' } });
    expect(useLintStore.getState().config.rules!['erd/fk-index'].severity).toBe('error');
    expect(JSON.parse(localStorage.getItem('sdd:lint')!).rules['erd/no-pk'].enabled).toBe(false);
    fireEvent.change(screen.getByLabelText('Severity of Foreign key without an index'), { target: { value: 'warning' } });
    expect(useLintStore.getState().config.rules!['erd/fk-index'].severity).toBeUndefined();
    fireEvent.change(screen.getByLabelText('Naming style'), { target: { value: 'any' } });
    expect(useLintStore.getState().config.naming).toBe('any');
  });
});

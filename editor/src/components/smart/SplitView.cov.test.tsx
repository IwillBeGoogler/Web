import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Diagnostic } from '@core/dsl';

let push: (d: Diagnostic[]) => void = () => {};
vi.mock('./CodeEditor', () => ({ default: ({ onDiagnostics }: { onDiagnostics: (d: Diagnostic[]) => void }) => { push = onDiagnostics; return <div data-testid="stub-editor" />; } }));
import { useSmart } from '../../store/smartStore';
import { useEditorSession } from '../../sync/status';
import { SplitView } from './SplitView';

const d = (severity: 'error' | 'warning', message: string, line: number) => ({ severity, message, line, col: 1 }) as unknown as Diagnostic;
const status = () => screen.getByTestId('split-status');

beforeEach(() => { useEditorSession.setState({ readOnly: false }); useSmart.setState({ code: true }); });

describe('SplitView status', () => {
  it('shows loading fallback then the editor', async () => {
    render(<SplitView />);
    expect(await screen.findByTestId('stub-editor')).toBeTruthy();
    expect(status().textContent).toBe('in sync');
  });
  it('reports errors (singular / plural) with first message and line, warnings, and read-only', async () => {
    render(<SplitView />);
    await screen.findByTestId('stub-editor');
    act(() => push([d('error', 'bad', 3)]));
    expect(status().textContent).toBe('1 error: bad (line 3)');
    expect(status().className).toContain('bad');
    act(() => push([d('error', 'bad', 3), d('error', 'worse', 4), d('warning', 'w', 1)]));
    expect(status().textContent).toBe('2 errors: bad (line 3)');
    act(() => push([d('warning', 'w', 1)]));
    expect(status().textContent).toBe('1 warning');
    expect(status().className).not.toContain('bad');
    act(() => push([d('warning', 'w', 1), d('warning', 'x', 2)]));
    expect(status().textContent).toBe('2 warnings');
    act(() => useEditorSession.setState({ readOnly: true }));
    expect(status().textContent).toBe('view only');
  });
  it('close button hides the code view in the store', async () => {
    render(<SplitView />);
    await screen.findByTestId('stub-editor');
    fireEvent.click(screen.getByRole('button', { name: 'Close text view' }));
    expect(useSmart.getState().code).toBe(false);
  });
});

import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { DialogHost } from './DialogHost';
import { Modal } from './Modal';
import { dialogs, useDialogStore } from '../../lib/dialogs';
import { useChoice, useConfirm, usePrompt } from '../../hooks/useDialogs';

afterEach(() => {
  act(() => useDialogStore.getState().clear());
});

function Harness({ onResult }: { onResult: (v: unknown) => void }) {
  const confirm = useConfirm();
  const prompt = usePrompt();
  const choose = useChoice();
  return (
    <>
      <button onClick={() => void confirm({ title: 'Delete page?', message: 'This cannot be undone.', confirmLabel: 'Delete', danger: true }).then(onResult)}>ask-confirm</button>
      <button onClick={() => void prompt({ title: 'Rename page', label: 'Page name', initial: 'Old', validate: (v) => (v.trim() ? (v === 'dup' ? 'Name already used' : null) : 'Name is required') }).then(onResult)}>ask-prompt</button>
      <button onClick={() => void choose({ title: 'Delete group', choices: [{ value: 'only', label: 'Delete group only' }, { value: 'all', label: 'Delete with children', variant: 'danger' }] }).then(onResult)}>ask-choice</button>
      <DialogHost />
    </>
  );
}
const setup = () => {
  const results: unknown[] = [];
  render(<Harness onResult={(v) => results.push(v)} />);
  return results;
};

describe('useConfirm', () => {
  it('resolves true on confirm, false on cancel, false on Esc, false on backdrop click', async () => {
    const results = setup();
    for (const how of ['confirm', 'cancel', 'esc', 'backdrop'] as const) {
      fireEvent.click(screen.getByText('ask-confirm'));
      const dialog = await screen.findByRole('alertdialog', { name: 'Delete page?' });
      expect(dialog).toHaveAttribute('aria-modal', 'true');
      expect(within(dialog).getByText('This cannot be undone.')).toBeInTheDocument();
      if (how === 'confirm') fireEvent.click(within(dialog).getByRole('button', { name: 'Delete' }));
      if (how === 'cancel') fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
      if (how === 'esc') fireEvent.keyDown(window, { key: 'Escape' });
      if (how === 'backdrop') fireEvent.mouseDown(dialog.parentElement!);
      await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    }
    expect(results).toEqual([true, false, false, false]);
  });
  it('type-to-confirm keeps the confirm button disabled until the exact text is typed', async () => {
    let result: unknown;
    render(<DialogHost />);
    void dialogs.confirm({ title: 'Delete project?', confirmLabel: 'Delete', danger: true, typeToConfirm: 'Big project' }).then((v) => (result = v));
    const dialog = await screen.findByRole('alertdialog');
    const btn = within(dialog).getByRole('button', { name: 'Delete' });
    expect(btn).toBeDisabled();
    const input = within(dialog).getByLabelText(/Type .*Big project.* to confirm/);
    fireEvent.change(input, { target: { value: 'big' } });
    expect(btn).toBeDisabled();
    fireEvent.change(input, { target: { value: 'Big project' } });
    expect(btn).toBeEnabled();
    fireEvent.click(btn);
    await waitFor(() => expect(result).toBe(true));
  });
});

describe('usePrompt', () => {
  it('resolves the trimmed string, validates, null on cancel / Esc', async () => {
    const results = setup();
    fireEvent.click(screen.getByText('ask-prompt'));
    let dialog = await screen.findByRole('dialog', { name: 'Rename page' });
    const input = within(dialog).getByLabelText('Page name') as HTMLInputElement;
    expect(input.value).toBe('Old');
    await waitFor(() => expect(document.activeElement).toBe(input)); // autofocus
    fireEvent.change(input, { target: { value: '   ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Name is required');
    expect(screen.queryByRole('dialog', { name: 'Rename page' })).not.toBeNull(); // still open
    fireEvent.change(input, { target: { value: 'dup' } });
    fireEvent.submit(input.closest('form')!);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Name already used');
    fireEvent.change(input, { target: { value: '  Fresh  ' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'OK' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Rename page' })).toBeNull());
    expect(results).toEqual(['Fresh']);

    fireEvent.click(screen.getByText('ask-prompt'));
    dialog = await screen.findByRole('dialog', { name: 'Rename page' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByText('ask-prompt'));
    dialog = await screen.findByRole('dialog', { name: 'Rename page' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(results).toEqual(['Fresh', null, null]);
  });
  it('Enter submits', async () => {
    const results = setup();
    fireEvent.click(screen.getByText('ask-prompt'));
    const dialog = await screen.findByRole('dialog', { name: 'Rename page' });
    const input = within(dialog).getByLabelText('Page name');
    fireEvent.change(input, { target: { value: 'Next' } });
    fireEvent.submit(input.closest('form')!);
    await waitFor(() => expect(results).toEqual(['Next']));
  });
});

describe('useChoice', () => {
  it('resolves the chosen value, null on cancel', async () => {
    const results = setup();
    fireEvent.click(screen.getByText('ask-choice'));
    let dialog = await screen.findByRole('dialog', { name: 'Delete group' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete with children' })); // selects the row
    expect(screen.getByRole('dialog')).toBeInTheDocument(); // ... nothing resolves until the primary button
    fireEvent.click(within(dialog).getByRole('button', { name: 'Continue' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(screen.getByText('ask-choice'));
    dialog = await screen.findByRole('dialog', { name: 'Delete group' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(results).toEqual(['all', null]);
  });
});

describe('Modal behaviour: focus trap, focus return, stacking', () => {
  it('Tab / Shift+Tab cycle inside the dialog', async () => {
    setup();
    fireEvent.click(screen.getByText('ask-choice'));
    const dialog = await screen.findByRole('dialog', { name: 'Delete group' });
    const focusables = within(dialog).getAllByRole('button');
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(last, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
  it('returns focus to the element that opened it', async () => {
    setup();
    const opener = screen.getByText('ask-confirm');
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole('alertdialog');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
    expect(document.activeElement).toBe(opener);
  });
  it('Esc closes only the top-most of two stacked dialogs', async () => {
    render(<DialogHost />);
    let a: unknown = 'pending';
    let b: unknown = 'pending';
    void dialogs.confirm({ title: 'First' }).then((v) => (a = v));
    await screen.findByRole('alertdialog', { name: 'First' });
    void dialogs.confirm({ title: 'Second' }).then((v) => (b = v));
    await screen.findByRole('alertdialog', { name: 'Second' });
    fireEvent.keyDown(window, { key: 'Escape' });
    await waitFor(() => expect(b).toBe(false));
    expect(a).toBe('pending');
    expect(screen.getByRole('alertdialog', { name: 'First' })).toBeInTheDocument();
  });
  it('a plain <Modal> is aria-modal, labelled, bottom-sheet flagged under 480px and animates in <= 180ms', async () => {
    const { rerender } = render(<Modal open title="Plain" onClose={() => undefined}><button>inside</button></Modal>);
    const dialog = await screen.findByRole('dialog', { name: 'Plain' });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(dialog.getAttribute('data-sheet')).toBe('false');
    const { MODAL_MS } = await import('./Modal');
    expect(MODAL_MS).toBeLessThanOrEqual(180);
    rerender(<Modal open={false} title="Plain" onClose={() => undefined}><button>inside</button></Modal>);
  });
});

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Modal } from './Modal';

const origMM = window.matchMedia;
afterEach(() => {
  window.matchMedia = origMM;
});
const tick = () => act(() => new Promise<void>((r) => setTimeout(r, 5)));

describe('Modal', () => {
  it('close button, custom close label, role, className', () => {
    const onClose = vi.fn();
    render(<Modal open title="T" closeLabel="Dismiss" onClose={onClose} role="alertdialog" className="foo"><p>hi</p></Modal>);
    const d = screen.getByRole('alertdialog', { name: 'T' });
    expect(d).toHaveClass('modal', 'foo');
    expect(d).toHaveAttribute('data-sheet', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onClose).toHaveBeenCalled();
  });
  it('backdrop mousedown closes; inner mousedown does not', () => {
    const onClose = vi.fn();
    const { container } = render(<Modal open title="T" onClose={onClose}>x</Modal>);
    fireEvent.mouseDown(screen.getByRole('dialog'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.mouseDown(container.ownerDocument.querySelector('.modal-backdrop')!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
  it('only the top-most modal reacts to Escape; other keys ignored', () => {
    const a = vi.fn();
    const b = vi.fn();
    render(<><Modal open title="A" onClose={a}>a</Modal><Modal open title="B" onClose={b}>b</Modal></>);
    fireEvent.keyDown(window, { key: 'x' });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).not.toHaveBeenCalled();
  });
  it('focuses [data-autofocus], else first input, else footer button, else focusable', async () => {
    const { unmount } = render(<Modal open title="T" onClose={() => {}}><input id="i1" /><button data-autofocus>go</button></Modal>);
    await tick();
    expect(screen.getByText('go')).toHaveFocus();
    unmount();
    const r2 = render(<Modal open title="T" onClose={() => {}}><button>b</button><input aria-label="inp" /></Modal>);
    await tick();
    expect(screen.getByLabelText('inp')).toHaveFocus();
    r2.unmount();
    const r3 = render(<Modal open title="T" onClose={() => {}}><div className="modal-foot"><button>foot</button></div></Modal>);
    await tick();
    expect(screen.getByText('foot')).toHaveFocus();
    r3.unmount();
  });
  it('keeps focus if already inside; restores focus to opener on close', async () => {
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    const { rerender } = render(<Modal open title="T" onClose={() => {}}><input aria-label="a" /></Modal>);
    await tick();
    expect(screen.getByLabelText('a')).toHaveFocus();
    rerender(<Modal open={false} title="T" onClose={() => {}}><input aria-label="a" /></Modal>);
    expect(opener).toHaveFocus();
    opener.remove();
  });
  it('empty modal (no focusable body): focus falls on close button; no focus target ok', async () => {
    render(<Modal open title="T" onClose={() => {}}>text</Modal>);
    await tick();
    expect(screen.getByRole('button', { name: 'Close' })).toHaveFocus();
  });
  it('Tab traps focus both directions', () => {
    render(<Modal open title="T" onClose={() => {}}><input aria-label="one" /><input aria-label="two" /></Modal>);
    const close = screen.getByRole('button', { name: 'Close' });
    const two = screen.getByLabelText('two');
    const dlg = screen.getByRole('dialog');
    two.focus();
    fireEvent.keyDown(dlg, { key: 'Tab' });
    expect(close).toHaveFocus();
    fireEvent.keyDown(dlg, { key: 'Tab', shiftKey: true });
    expect(two).toHaveFocus();
    // focus outside the dialog: tab goes to first, shift+tab to last
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(dlg, { key: 'Tab' });
    expect(close).toHaveFocus();
    (document.activeElement as HTMLElement).blur();
    fireEvent.keyDown(dlg, { key: 'Tab', shiftKey: true });
    expect(two).toHaveFocus();
    // middle: default untouched
    screen.getByLabelText('one').focus();
    const ev = fireEvent.keyDown(dlg, { key: 'Tab' });
    expect(ev).toBe(true);
    // non-tab ignored
    expect(fireEvent.keyDown(dlg, { key: 'a' })).toBe(true);
  });
  it('Tab with no focusables is prevented', () => {
    render(<Modal open title="T" onClose={() => {}}>x</Modal>);
    const dlg = screen.getByRole('dialog');
    dlg.querySelectorAll('button').forEach((b) => b.setAttribute('tabindex', '-1'));
    // close button remains matched by FOCUSABLE (button:not([disabled])); disable it
    dlg.querySelectorAll('button').forEach((b) => ((b as HTMLButtonElement).disabled = true));
    expect(fireEvent.keyDown(dlg, { key: 'Tab' })).toBe(false);
  });
  it('becomes a bottom sheet on narrow viewports and reacts to media changes', () => {
    let handler: (() => void) | null = null;
    const mq = { matches: true, addEventListener: (_: string, h: () => void) => (handler = h), removeEventListener: vi.fn() };
    window.matchMedia = (() => mq) as never;
    const { unmount } = render(<Modal open title="T" onClose={() => {}}>x</Modal>);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-sheet', 'true');
    mq.matches = false;
    act(() => handler!());
    expect(screen.getByRole('dialog')).toHaveAttribute('data-sheet', 'false');
    unmount();
    expect(mq.removeEventListener).toHaveBeenCalled();
  });
  it('tolerates missing matchMedia and missing add/removeEventListener', () => {
    (window as unknown as { matchMedia?: unknown }).matchMedia = undefined;
    const { unmount } = render(<Modal open title="T" onClose={() => {}}>x</Modal>);
    expect(screen.getByRole('dialog')).toHaveAttribute('data-sheet', 'false');
    unmount();
    window.matchMedia = (() => ({ matches: false })) as never;
    const r = render(<Modal open title="T" onClose={() => {}}>x</Modal>);
    r.unmount();
  });
});

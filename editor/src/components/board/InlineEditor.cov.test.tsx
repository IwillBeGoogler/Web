import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InlineEditor } from './InlineEditor';

const mount = (p: Partial<React.ComponentProps<typeof InlineEditor>> = {}) => {
  const onCommit = vi.fn(), onDone = vi.fn();
  render(<InlineEditor value="old" onCommit={onCommit} onDone={onDone} aria-label="ed" {...p} />);
  return { onCommit, onDone, el: screen.getByLabelText('ed') as HTMLInputElement | HTMLTextAreaElement };
};

describe('InlineEditor', () => {
  it('single line: input, classes, selects all on focus, Enter commits and finishes once', () => {
    const { el, onCommit, onDone } = mount({ className: 'x', style: { color: 'red' } });
    expect(el.tagName).toBe('INPUT');
    expect(el.className).toBe('nodrag nowheel inline-edit x');
    const sel = vi.spyOn(el, 'select');
    fireEvent.focus(el);
    expect(sel).toHaveBeenCalled();
    fireEvent.change(el, { target: { value: 'new' } });
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onCommit).toHaveBeenCalledWith('new');
    expect(onDone).toHaveBeenCalledTimes(1);
    fireEvent.blur(el); // already finished: no second commit
    expect(onCommit).toHaveBeenCalledTimes(1);
  });
  it('unchanged text is not committed; className defaults to empty', () => {
    const { el, onCommit, onDone } = mount();
    expect(el.className).toBe('nodrag nowheel inline-edit ');
    fireEvent.blur(el);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalled();
  });
  it('multiline: Enter does not commit, Cmd/Ctrl+Enter does; onInput sees live text', () => {
    const onInput = vi.fn();
    const { el, onCommit, onDone } = mount({ multiline: true, onInput });
    expect(el.tagName).toBe('TEXTAREA');
    fireEvent.change(el, { target: { value: 'two\nlines' } });
    expect(onInput).toHaveBeenCalledWith('two\nlines');
    fireEvent.keyDown(el, { key: 'Enter' });
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.keyDown(el, { key: 'Enter', ctrlKey: true });
    expect(onCommit).toHaveBeenCalledWith('two\nlines');
    expect(onDone).toHaveBeenCalledTimes(1);
  });
  it('multiline Cmd+Enter also commits', () => {
    const { el, onCommit } = mount({ multiline: true });
    fireEvent.change(el, { target: { value: 'z' } });
    fireEvent.keyDown(el, { key: 'Enter', metaKey: true });
    expect(onCommit).toHaveBeenCalledWith('z');
  });
  it('Escape cancels: done without committing, even on the following blur', () => {
    const { el, onCommit, onDone } = mount();
    fireEvent.change(el, { target: { value: 'zzz' } });
    fireEvent.keyDown(el, { key: 'Escape' });
    fireEvent.blur(el);
    expect(onCommit).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(2);
  });
  it('seed starts the edit with the typed text and the caret at the end', () => {
    const { el } = mount({ seed: 'abc' });
    expect(el.value).toBe('abc');
    const range = vi.spyOn(el, 'setSelectionRange');
    fireEvent.focus(el);
    expect(range).toHaveBeenCalledWith(3, 3);
  });
  it('onKey handles node specific keys (prevents default, can commit); unhandled keys fall through', () => {
    const onKey = vi.fn((e: React.KeyboardEvent, commit: () => void) => { if (e.key === 'Tab') { commit(); return true; } return false; });
    const { el, onCommit, onDone } = mount({ onKey });
    fireEvent.change(el, { target: { value: 'tabbed' } });
    const notPrevented = fireEvent.keyDown(el, { key: 'Tab' });
    expect(notPrevented).toBe(false);
    expect(onCommit).toHaveBeenCalledWith('tabbed');
    expect(onDone).not.toHaveBeenCalled();
    fireEvent.keyDown(el, { key: 'a' });
    expect(onKey).toHaveBeenCalledTimes(2);
  });
  it('keys never bubble to the canvas', () => {
    const outer = vi.fn();
    render(<div onKeyDown={outer}><InlineEditor value="v" onCommit={vi.fn()} onDone={vi.fn()} aria-label="q" /></div>);
    fireEvent.keyDown(screen.getByLabelText('q'), { key: 'a' });
    expect(outer).not.toHaveBeenCalled();
  });
});
